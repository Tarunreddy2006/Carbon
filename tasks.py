"""
tasks.py
─────────────────────────────────────────────────────────────────────────────
The automated AI background tasks.
─────────────────────────────────────────────────────────────────────────────
"""
import logging
import asyncio
import math
from celery import shared_task
from sqlalchemy.orm import Session
from sqlalchemy import func, update
import shapely.wkt
import shapely.geometry
from datetime import datetime, timezone
import json

from database.db import SessionLocal
from database.models import (
    ParcelRecord, CarbonCredit, CreditStatus, Ecoregion,
    BulkJob, BulkItem, JobStatus
)
from services.service import analyse_parcel, export_ndvi_cog
from utils.logic import run_carbon_pipeline

logger = logging.getLogger("celery_tasks")

@shared_task
def run_continuous_mrv_audit():
    """
    Periodic cron job that re-scans all active carbon projects.
    If biomass drops by >15%, it flags the asset.
    """
    logger.info("🌍 Waking up Satellite Sentinels: Starting Monthly MRV Audit...")
    db: Session = SessionLocal()

    try:
        # 1. Fetch only credits that are currently active/verified
        active_credits = db.query(CarbonCredit).filter(CarbonCredit.status == CreditStatus.VERIFIED).all()
        
        for credit in active_credits:
            parcel = credit.parcel
            if not parcel:
                continue

            logger.info(f"🛰️ Re-scanning Parcel {parcel.id}...")

            # 2. Convert database Geometry back to GeoJSON for Google Earth Engine
            geom_obj = shapely.wkb.loads(bytes(parcel.boundary.data))
            geojson_geom = {"type": "Polygon", "coordinates": [list(shapely.geometry.mapping(geom_obj)['coordinates'][0])]}
            
            intersecting_biome = db.query(Ecoregion).filter(
                func.ST_Intersects(Ecoregion.geom, func.ST_GeomFromWKB(geom_obj.wkb, 4326))
            ).first()
            biome_name = intersecting_biome.biome_name if intersecting_biome else "Default"
            
            # 3. Re-run Satellite Analysis (Run the async GEE function synchronously)
            gee_data = analyse_parcel(geojson_geom)

            # Calculate total scenes for the kill-switch
            total_scenes = gee_data.get("opt_imgs", 0) + gee_data.get("rad_imgs", 0)

            # 4. Calculate Current Carbon using our Sensor Fusion logic
            current_results = run_carbon_pipeline(
                biome_name=biome_name,
                parcel_area_ha=parcel.calculated_area_ha,
                rh95=gee_data.get("rh95", 15.0),
                veg_pixels=gee_data.get("vegetation_pixel_count", gee_data.get("veg_pixels", 0)), 
                ndvi=gee_data["ndvi"],
                evi=gee_data.get("evi", 0.0),
                ndmi=gee_data.get("ndmi", 0.0),
                vv=gee_data.get("vv", -20.0),
                vh=gee_data.get("vh", -20.0),
                elevation=gee_data.get("elevation", 0.0),
                slope=gee_data.get("slope", 0.0),
                scenes_used=total_scenes
            )

            current_co2e = current_results["co2_equivalent_tons"]
            original_co2e = credit.estimated_co2e

            # 5. Check for Deforestation Event
            decline_percentage = ((original_co2e - current_co2e) / original_co2e) * 100.0

            if decline_percentage > 15.0:
                logger.warning(f"🚨 DEFORESTATION DETECTED on Certificate {credit.unique_code}!")
                logger.warning(f"Drop: {decline_percentage:.1f}% | Original: {original_co2e}t | Current: {current_co2e}t")
                
                # Update the ledger to flag the asset
                credit.status = CreditStatus.FLAGGED
                db.commit()

            else:
                logger.info(f"✅ Certificate {credit.unique_code} is healthy. (Change: {decline_percentage:.1f}%)")

        logger.info("🏁 Continuous MRV Audit Complete. Returning to sleep.")

    except Exception as e:
        logger.error(f"Error during MRV Audit: {e}", exc_info=True)
    finally:
        db.close()

from services.service import get_historical_ndvi
from services.ledger import generate_cryptographic_proof
from services.validation import validate_and_clean_geometry
from sqlalchemy import func
from datetime import datetime, timezone
import json

@shared_task(bind=True)
def async_estimate_carbon_draw(self, payload_dict: dict, user_role: str):
    logger.info("======================================================")
    logger.info(f"▶ ASYNC PARCEL REGISTRATION INITIATED ({payload_dict.get('farm_id')})")
    logger.info("======================================================")
    db: Session = SessionLocal()
    
    user_id = payload_dict.get("user_id")
    
    try:
        # 1. High-Precision Geometry Validation
        geojson_geom = {"type": "Polygon", "coordinates": [payload_dict['coordinates']]}
        
        geom_obj, parcel_area_ha = validate_and_clean_geometry(geojson_geom)
        
        if not geom_obj:
            raise ValueError("Invalid geometry. Ensure polygon is closed and non-intersecting.")

        intersecting_biome = db.query(Ecoregion).filter(
            func.ST_Intersects(Ecoregion.geom, func.ST_GeomFromWKB(geom_obj.wkb, 4326))
        ).first()
        biome_name = intersecting_biome.biome_name if intersecting_biome else "Default"

        wkt_string = geom_obj.wkt if hasattr(geom_obj, 'wkt') else str(geom_obj)

        # 2. Anti-Fraud Overlap Check
        logger.info("🛡️ Running PostGIS Anti-Fraud Overlap Check...")
        new_geom = func.ST_GeomFromText(wkt_string, 4326)
        
        overlapping_parcels = db.query(ParcelRecord).filter(
            func.ST_Intersects(ParcelRecord.boundary, new_geom)
        ).all()

        for existing_parcel in overlapping_parcels:
            overlap_fraction = db.query(
                func.ST_Area(func.ST_Intersection(existing_parcel.boundary, new_geom), True) / 
                func.ST_Area(new_geom, True)
            ).scalar()
            
            overlap_pct = (overlap_fraction or 0.0) * 100.0

            if overlap_pct > 2.0:
                raise ValueError(json.dumps({
                    "error": "Spatial Overlap Detected",
                    "message": f"This boundary overlaps an existing registered carbon asset by {overlap_pct:.1f}%.",
                    "conflicting_parcel_uuid": str(existing_parcel.id)
                }))

        # 3. Persist Spatial Data
        new_parcel = ParcelRecord(
            farm_id=payload_dict.get('farm_id'),
            user_id=payload_dict.get('user_id'),
            boundary=wkt_string, 
            source_type=payload_dict.get('source_type'),
            calculated_area_ha=parcel_area_ha
        )
        db.add(new_parcel)

        # 4. Multi-Sensor Analysis (GEE)
        logger.info("⏳ Sending geometry to Google Earth Engine...")
        gee_data = analyse_parcel(geojson_geom)

        # 4b. Export NDVI raster as Cloud Optimized GeoTIFF for TiTiler streaming
        logger.info("📡 Exporting NDVI raster as COG for dynamic tile streaming...")
        cog_result = export_ndvi_cog(gee_data, geojson_geom, str(payload_dict.get('farm_id', 'unknown')))

        # Calculate total scenes for the kill-switch
        total_scenes = gee_data.get("opt_imgs", 0) + gee_data.get("rad_imgs", 0)

        # 5. Scientific Metrics Calculation
        from utils.logic import run_carbon_pipeline
        
        # 🌟 FIXED: Pull the true, active vegetation pixel arrays from GEE data dict
        true_veg_pixels = int(gee_data.get("veg_pixels", 0))
        true_canopy_m2 = min(float(parcel_area_ha * 10000.0), float(true_veg_pixels * 100.0))
        true_canopy_ha = round(true_canopy_m2 / 10000.0, 4)

        results = run_carbon_pipeline(
            parcel_area_ha=parcel_area_ha,
            biome_name=biome_name,
            rh95=gee_data.get("rh95", 15.0),
            veg_pixels=true_veg_pixels, 
            ndvi=gee_data["ndvi_mean"],
            evi=gee_data.get("evi", 0.0),
            ndmi=gee_data.get("ndmi", 0.0),
            vv=gee_data.get("vv", -20.0),
            vh=gee_data.get("vh", -20.0),
            elevation=gee_data.get("elevation", 0.0),
            slope=gee_data.get("slope", 0.0),
            scenes_used=total_scenes
        )
        
        db.commit()
        db.refresh(new_parcel)

        # 6. Historical Trend Analysis
        logger.info("⏳ Fetching 5-Year Historical Baseline...")
        trends = []
        curr_year = int(datetime.now(timezone.utc).year)
        
        for year in range(curr_year - 4, curr_year + 1):
            hist_ndvi = get_historical_ndvi(geojson_geom, year)
            
            hist_co2 = round(hist_ndvi * results["co2_equivalent_tons"] / max(0.01, gee_data["ndvi_mean"]), 2)
            
            # 🌟 FIXED: Historical canopy area calculation now respects true baseline canopy density bounds
            hist_canopy_ha = round(true_canopy_ha * (hist_ndvi / max(0.01, gee_data["ndvi_mean"])), 4)
            # Ensure it never overflows gross physical parcel property bounds
            hist_canopy_ha = min(parcel_area_ha, hist_canopy_ha)

            trends.append({
                "year": year, 
                "carbon_tons": round(hist_co2 / 3.66, 2),
                "canopy_area_hectares": hist_canopy_ha,
                "confidence_score": round(max(5.0, results.get("confidence_score", 95.0) - (curr_year - year)), 1)
            })

        final_conf = results.get("confidence_score", 95.0)

        # 7. Mint Cryptographic Proof
        cert_id, data_hash, raw_payload_dict = generate_cryptographic_proof(
            parcel_id=str(new_parcel.id),
            vintage_year=str(curr_year),
            co2e=results["co2_equivalent_tons"],
            geojson_geom=geojson_geom,
            ndvi_mean=gee_data["ndvi_mean"]
        )
        
        new_credit = CarbonCredit(
            parcel_id=new_parcel.id,
            vintage_year=str(curr_year),
            unique_code=cert_id,
            estimated_co2e=results["co2_equivalent_tons"],
            status=CreditStatus.VERIFIED,
            data_hash=data_hash,
            raw_payload=raw_payload_dict
        )
        db.add(new_credit)
        db.commit()

        logger.info(f"✅ Ledger Entry Created: {cert_id}")

        # 8. Compile Final JSON output
        return {
            "parcel_id": str(new_parcel.id),
            "credit_certificate": cert_id,
            "parcel_polygon": geojson_geom,
            
            "parcel_area_hectares": parcel_area_ha,
            "ndvi_mean": round(gee_data["ndvi_mean"], 3),
            "ndvi_min": round(gee_data.get("ndvi_min", 0.0), 3),
            "ndvi_max": round(gee_data.get("ndvi_max", 0.0), 3),
            
            # 🌟 FIXED: True telemetry metrics loaded dynamically to restore audit alignment
            "vegetation_pixel_count": true_veg_pixels,
            "canopy_area_m2": min(float(parcel_area_ha * 10000.0), true_canopy_m2),
            "canopy_area_hectares": min(float(parcel_area_ha), true_canopy_ha),
            
            "biomass_density_tons_per_ha": results.get("biomass_per_ha", 0),
            "biomass_tons": results.get("total_biomass_tons", 0),
            "carbon_tons": results.get("total_carbon_tons", 0),
            "co2_equivalent_tons": results["co2_equivalent_tons"],
            
            "confidence_score": results.get("confidence_score", final_conf),
            "historical_trends": trends,
            
            "satellite_dataset": "Sentinel-2 L2A + Sentinel-1 SAR + GEDI",
            "optical_images_used": gee_data.get("optical_images_used", gee_data.get("opt_imgs", 0)),
            "radar_images_used": gee_data.get("radar_images_used", gee_data.get("rad_imgs", 0)),
            "fusion_ratio": "ML Random Forest Inference",
            "image_count": total_scenes,
            "date_range": {"start": str(curr_year - 4), "end": str(curr_year)},
            "user_id": user_id,

            "ndvi_tiles_url": cog_result.get("titiler_tiles_url", None),
            "cog_filename": cog_result.get("cog_filename", None)
        }

    except Exception as e:
        logger.error(f"Task Failed: {e}", exc_info=True)
        raise
    finally:
        db.close()


@shared_task(bind=True)
def async_rerun_mrv(self, parcel_id: str, user_id: str):
    logger.info("======================================================")
    logger.info(f"▶ ASYNC PARCEL RERUN INITIATED ({parcel_id})")
    logger.info("======================================================")
    db: Session = SessionLocal()
    
    try:
        parcel = db.query(ParcelRecord).filter(ParcelRecord.id == parcel_id).first()
        if not parcel:
            raise ValueError(f"Parcel {parcel_id} not found.")

        # 1. Convert database Geometry back to GeoJSON for Google Earth Engine
        geom_obj = shapely.wkb.loads(bytes(parcel.boundary.data))
        geojson_geom = {"type": "Polygon", "coordinates": [list(shapely.geometry.mapping(geom_obj)['coordinates'][0])]}
        
        intersecting_biome = db.query(Ecoregion).filter(
            func.ST_Intersects(Ecoregion.geom, func.ST_GeomFromWKB(geom_obj.wkb, 4326))
        ).first()
        biome_name = intersecting_biome.biome_name if intersecting_biome else "Default"
        
        # 2. Multi-Sensor Analysis (GEE)
        logger.info("⏳ Sending geometry to Google Earth Engine for Rerun...")
        gee_data = analyse_parcel(geojson_geom)

        # 2b. Export NDVI raster as Cloud Optimized GeoTIFF for TiTiler streaming
        logger.info("📡 Exporting NDVI raster as COG for rerun tile streaming...")
        cog_result = export_ndvi_cog(gee_data, geojson_geom, parcel_id)

        # Calculate total scenes for the kill-switch
        total_scenes = gee_data.get("opt_imgs", 0) + gee_data.get("rad_imgs", 0)

        # 3. Scientific Metrics Calculation
        from utils.logic import run_carbon_pipeline
        
        # 🌟 FIXED: Pull the true, active vegetation pixel arrays from GEE data dict for Rerun
        true_veg_pixels = int(gee_data.get("veg_pixels", 0))
        true_canopy_m2 = min(float(parcel.calculated_area_ha * 10000.0), float(true_veg_pixels * 100.0))
        true_canopy_ha = round(true_canopy_m2 / 10000.0, 4)

        results = run_carbon_pipeline(
            parcel_area_ha=parcel.calculated_area_ha,
            biome_name=biome_name,
            rh95=gee_data.get("rh95", 15.0),
            veg_pixels=true_veg_pixels, 
            ndvi=gee_data["ndvi_mean"],
            evi=gee_data.get("evi", 0.0),
            ndmi=gee_data.get("ndmi", 0.0),
            vv=gee_data.get("vv", -20.0),
            vh=gee_data.get("vh", -20.0),
            elevation=gee_data.get("elevation", 0.0),
            slope=gee_data.get("slope", 0.0),
            scenes_used=total_scenes
        )

        curr_year = int(datetime.now(timezone.utc).year)
        
        # 4. Mint Cryptographic Proof for new vintage
        cert_id, data_hash, raw_payload_dict = generate_cryptographic_proof(
            parcel_id=str(parcel.id),
            vintage_year=str(curr_year),
            co2e=results["co2_equivalent_tons"],
            geojson_geom=geojson_geom,
            ndvi_mean=gee_data["ndvi_mean"]
        )
        
        new_credit = CarbonCredit(
            parcel_id=parcel.id,
            vintage_year=str(curr_year),
            unique_code=cert_id,
            estimated_co2e=results["co2_equivalent_tons"],
            status=CreditStatus.VERIFIED,
            data_hash=data_hash,
            raw_payload=raw_payload_dict
        )
        db.add(new_credit)
        db.commit()

        logger.info(f"✅ Rerun Ledger Entry Created: {cert_id}")

        final_conf = results.get("confidence_score", 95.0)

        return {
            "parcel_id": str(parcel.id),
            "credit_certificate": cert_id,
            "parcel_polygon": geojson_geom,
            
            "parcel_area_hectares": parcel.calculated_area_ha,
            "ndvi_mean": round(gee_data["ndvi_mean"], 3),
            "ndvi_min": round(gee_data.get("ndvi_min", 0.0), 3),
            "ndvi_max": round(gee_data.get("ndvi_max", 0.0), 3),
            
            # 🌟 FIXED: True telemetry metrics loaded dynamically during reruns
            "vegetation_pixel_count": true_veg_pixels,
            "canopy_area_m2": min(float(parcel.calculated_area_ha * 10000.0), true_canopy_m2),
            "canopy_area_hectares": min(float(parcel.calculated_area_ha), true_canopy_ha),
            
            "biomass_density_tons_per_ha": results.get("biomass_per_ha", 0),
            "biomass_tons": results.get("total_biomass_tons", 0),
            "carbon_tons": results.get("total_carbon_tons", 0),
            "co2_equivalent_tons": results["co2_equivalent_tons"],
            
            "confidence_score": results.get("confidence_score", final_conf),
            "historical_trends": [],
            
            "satellite_dataset": "Sentinel-2 L2A + Sentinel-1 SAR + GEDI",
            "optical_images_used": gee_data.get("optical_images_used", gee_data.get("opt_imgs", 0)),
            "radar_images_used": gee_data.get("radar_images_used", gee_data.get("rad_imgs", 0)),
            "fusion_ratio": "ML Random Forest Inference",
            "image_count": total_scenes,
            "date_range": {"start": str(curr_year), "end": str(curr_year)},
            "user_id": user_id,

            "ndvi_tiles_url": cog_result.get("titiler_tiles_url", None),
            "cog_filename": cog_result.get("cog_filename", None)
        }

    except Exception as e:
        logger.error(f"Rerun Task Failed: {e}", exc_info=True)
        raise
    finally:
        db.close()

# ═══════════════════════════════════════════════════════════════════════════
# BULK PARCEL AUDIT — MICRO-TASK PROCESSOR
# ═══════════════════════════════════════════════════════════════════════════

def _synthesize_circle_polygon(lat: float, lon: float, radius_m: float, num_points: int = 64) -> dict:
    """
    Convert a (lat, lon, radius_meters) triplet into a GeoJSON Polygon
    representing a circular bounding area.

    Uses geodetic offset approximation (meters → degrees) identical to the
    frontend _createGeoJSONCircle helper in app.js.

    Returns:
        GeoJSON geometry dict with type 'Polygon' and coordinates in [lng, lat] order.
    """
    coords = []
    # Degree-distance conversion at the given latitude
    dist_x = radius_m / (111320.0 * math.cos(math.radians(lat)))
    dist_y = radius_m / 110540.0

    for i in range(num_points):
        theta = (i / num_points) * (2.0 * math.pi)
        x = dist_x * math.cos(theta)
        y = dist_y * math.sin(theta)
        coords.append([round(lon + x, 8), round(lat + y, 8)])

    # Close the ring
    coords.append(coords[0])

    return {"type": "Polygon", "coordinates": [coords]}


def _compute_polygon_area_ha(geojson_geom: dict) -> float:
    """
    Compute polygon area in hectares using an equal-area projection (EPSG:6933),
    consistent with services/geometry.py calculations.
    """
    import pyproj
    from shapely.geometry import shape
    from shapely.ops import transform

    poly = shape(geojson_geom)
    project = pyproj.Transformer.from_crs("epsg:4326", "epsg:6933", always_xy=True).transform
    projected = transform(project, poly)
    return round(projected.area / 10000.0, 4)


@shared_task(bind=True, max_retries=2, default_retry_delay=30)
def async_process_bulk_item(self, item_id: str):
    """
    Process a single BulkItem through the full carbon analysis pipeline.

    Flow:
        1. Load item from DB, set status → PROCESSING
        2. If item contains custom_geometry, use it directly.
           Otherwise, synthesize circular polygon from (lat, lon, radius)
        3. Determine biome via PostGIS intersection
        4. Run GEE analyse_parcel() for satellite metrics
        5. Run run_carbon_pipeline() for carbon calculations
        6. Save results to item row
        7. Atomically increment parent job counter
        8. Check if job is complete → mark COMPLETED if so
    """
    logger.info(f"▶ BULK ITEM PROCESSING: {item_id}")
    db: Session = SessionLocal()

    try:
        # ── 1. Load item ──────────────────────────────────────────────────
        item = db.query(BulkItem).filter(BulkItem.id == item_id).first()
        if not item:
            logger.error(f"BulkItem {item_id} not found in database.")
            return {"status": "error", "message": "Item not found"}

        item.status = JobStatus.PROCESSING
        db.commit()

        # ── 2. Determine Geometry ─────────────────────────────────────────
        if item.custom_geometry:
            if isinstance(item.custom_geometry, dict):
                geojson_geom = item.custom_geometry
            else:
                geojson_geom = json.loads(item.custom_geometry)
        else:
            # Synthesize circular polygon
            geojson_geom = _synthesize_circle_polygon(
                lat=item.latitude,
                lon=item.longitude,
                radius_m=item.radius_meters
            )

        parcel_area_ha = _compute_polygon_area_ha(geojson_geom)

        # ── 3. Determine biome via PostGIS ────────────────────────────────
        geom_obj = shapely.geometry.shape(geojson_geom)
        intersecting_biome = db.query(Ecoregion).filter(
            func.ST_Intersects(
                Ecoregion.geom,
                func.ST_GeomFromWKB(geom_obj.wkb, 4326)
            )
        ).first()
        biome_name = intersecting_biome.biome_name if intersecting_biome else "Default"

        # ── 4. GEE Satellite Analysis ─────────────────────────────────────
        logger.info(f"⏳ Sending bulk item {item_id} to Google Earth Engine...")
        gee_data = analyse_parcel(geojson_geom)

        total_scenes = gee_data.get("opt_imgs", 0) + gee_data.get("rad_imgs", 0)

        # ── 5. Carbon Pipeline ────────────────────────────────────────────
        results = run_carbon_pipeline(
            parcel_area_ha=parcel_area_ha,
            biome_name=biome_name,
            rh95=gee_data.get("rh95", 15.0),
            veg_pixels=gee_data.get("vegetation_pixel_count", gee_data.get("veg_pixels", 0)),
            ndvi=gee_data["ndvi"],
            evi=gee_data.get("evi", 0.0),
            ndmi=gee_data.get("ndmi", 0.0),
            vv=gee_data.get("vv", -20.0),
            vh=gee_data.get("vh", -20.0),
            elevation=gee_data.get("elevation", 0.0),
            slope=gee_data.get("slope", 0.0),
            scenes_used=total_scenes
        )

        # ── 6. Persist results to item ────────────────────────────────────
        item.calculated_area_ha = parcel_area_ha
        item.ndvi_mean = round(gee_data["ndvi"], 4)
        item.co2_equivalent_tons = results["co2_equivalent_tons"]
        item.confidence_score = results.get("confidence_score", 0.0)
        item.status = JobStatus.COMPLETED
        item.error_message = None
        db.commit()

        logger.info(
            f"✅ Bulk item {item_id} complete: "
            f"{results['co2_equivalent_tons']} t CO₂e @ {results.get('confidence_score', 0)}% confidence"
        )

    except Exception as e:
        logger.error(f"❌ Bulk item {item_id} failed: {e}", exc_info=True)
        db.rollback()

        # Mark item as failed but don't kill the whole job
        try:
            item = db.query(BulkItem).filter(BulkItem.id == item_id).first()
            if item:
                item.status = JobStatus.FAILED
                item.error_message = str(e)[:500]
                db.commit()
        except Exception:
            db.rollback()

    finally:
        # ── 7. Atomic parent counter increment ────────────────────────────
        # Uses SQL-level arithmetic to prevent race conditions across
        # parallel Celery workers updating the same BulkJob row.
        try:
            item = db.query(BulkItem).filter(BulkItem.id == item_id).first()
            if item:
                job_id = item.job_id

                db.execute(
                    update(BulkJob)
                    .where(BulkJob.id == job_id)
                    .values(processed_rows=BulkJob.processed_rows + 1)
                )
                db.commit()

                # ── 8. Check job completion ───────────────────────────────
                job = db.query(BulkJob).filter(BulkJob.id == job_id).first()
                if job and job.processed_rows >= job.total_rows:
                    # Determine final status: COMPLETED if any items succeeded,
                    # FAILED if ALL items failed
                    failed_count = db.query(BulkItem).filter(
                        BulkItem.job_id == job_id,
                        BulkItem.status == JobStatus.FAILED
                    ).count()

                    if failed_count >= job.total_rows:
                        job.status = JobStatus.FAILED
                    else:
                        job.status = JobStatus.COMPLETED

                    job.completed_at = datetime.now(timezone.utc)
                    db.commit()
                    logger.info(
                        f"🏁 Bulk Job {job_id} FINISHED — "
                        f"{job.total_rows - failed_count}/{job.total_rows} items succeeded"
                    )
        except Exception as counter_err:
            logger.error(f"Counter update error: {counter_err}", exc_info=True)
            db.rollback()
        finally:
            db.close()
