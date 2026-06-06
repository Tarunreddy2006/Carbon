"""
tasks.py
─────────────────────────────────────────────────────────────────────────────
The automated AI background tasks.
─────────────────────────────────────────────────────────────────────────────
"""
import logging
import asyncio
from celery import shared_task
from sqlalchemy.orm import Session
import shapely.wkt
import shapely.geometry

from database.db import SessionLocal
from database.models import ParcelRecord, CarbonCredit, CreditStatus, Ecoregion
from sqlalchemy import func
from services.service import analyse_parcel
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
                canopy_height=gee_data.get("canopy_height", 15.0),
                veg_pixels=gee_data.get("vegetation_pixel_count", gee_data.get("veg_pixels", 0)), 
                ndvi_mean=gee_data["ndvi_mean"],
                sar_vv=gee_data.get("sar_vv_backscatter", -20.0),
                sar_vh=gee_data.get("sar_vh_backscatter", -20.0),
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
    tree_species = payload_dict.get("tree_species", "mixed_tropical")
    
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
        # Called synchronously
        gee_data = analyse_parcel(geojson_geom)

        # Calculate total scenes for the kill-switch
        total_scenes = gee_data.get("opt_imgs", 0) + gee_data.get("rad_imgs", 0)

        # 5. Scientific Metrics Calculation
        from utils.logic import calculate_asset_confidence
        results = run_carbon_pipeline(
            parcel_area_ha=parcel_area_ha,
            biome_name=biome_name,
            canopy_height=gee_data.get("canopy_height", 15.0),
            veg_pixels=gee_data.get("vegetation_pixel_count", gee_data.get("veg_pixels", 0)), 
            ndvi_mean=gee_data["ndvi_mean"],
            sar_vv=gee_data.get("sar_vv_backscatter", -20.0),
            sar_vh=gee_data.get("sar_vh_backscatter", -20.0),
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
            
            trends.append({
                "year": year, 
                "carbon_tons": round(hist_co2 / 3.66, 2),
                "canopy_area_hectares": round(results.get("area_hectares", 0) * (hist_ndvi / max(0.01, gee_data["ndvi_mean"])), 2),
                "confidence_score": round(max(5.0, results.get("confidence_score", 95.0) - (curr_year - year)), 1)})

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
            "vegetation_pixel_count": gee_data.get("vegetation_pixel_count", gee_data.get("veg_pixels", 0)),
            "canopy_area_m2": results.get("area_hectares", 0) * 10000,
            "canopy_area_hectares": results.get("area_hectares", 0),
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
            "image_count": gee_data.get("optical_images_used", 0) + gee_data.get("radar_images_used", 0),
            "date_range": {"start": str(curr_year - 4), "end": str(curr_year)},
            "user_id": user_id
        }

    except Exception as e:
        logger.error(f"Task Failed: {e}", exc_info=True)
        # If ValueError containing JSON, re-raise it so the polling endpoint can extract it
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

        # Calculate total scenes for the kill-switch
        total_scenes = gee_data.get("opt_imgs", 0) + gee_data.get("rad_imgs", 0)

        # 3. Scientific Metrics Calculation
        from utils.logic import run_carbon_pipeline, calculate_asset_confidence
        results = run_carbon_pipeline(
            parcel_area_ha=parcel.calculated_area_ha,
            biome_name=biome_name,
            canopy_height=gee_data.get("canopy_height", 15.0),
            veg_pixels=gee_data.get("vegetation_pixel_count", gee_data.get("veg_pixels", 0)), 
            ndvi_mean=gee_data["ndvi_mean"],
            sar_vv=gee_data.get("sar_vv_backscatter", -20.0),
            sar_vh=gee_data.get("sar_vh_backscatter", -20.0),
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
            "vegetation_pixel_count": gee_data.get("vegetation_pixel_count", gee_data.get("veg_pixels", 0)),
            "canopy_area_m2": results.get("area_hectares", 0) * 10000,
            "canopy_area_hectares": results.get("area_hectares", 0),
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
            "image_count": gee_data.get("opt_imgs", 0) + gee_data.get("rad_imgs", 0),
            "date_range": {"start": str(curr_year), "end": str(curr_year)},
            "user_id": user_id
        }

    except Exception as e:
        logger.error(f"Rerun Task Failed: {e}", exc_info=True)
        raise
    finally:
        db.close()
