"""
routes/estimate.py
─────────────────────────────────────────────────────────────────────────────
The main bridge between the GEE engine and the UI.
Orchestrates validation, anti-fraud checks, historical analysis, and metric generation.
─────────────────────────────────────────────────────────────────────────────
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func
from starlette.concurrency import run_in_threadpool

# Database & Models
from database.db import get_db
from database.models import ParcelRecord, CarbonCredit
from models.parcel import CarbonEstimateResponse, DynamicParcelRequest

# Services & Logic
from services.service import analyse_parcel, get_historical_ndvi
from services.validation import validate_and_clean_geometry
from utils.logic import run_carbon_pipeline, calculate_confidence_score
from services.ledger import generate_credit_certificate

logger = logging.getLogger("carbon_engine")
router = APIRouter(tags=["Estimation Engine"])

@router.get("/health", status_code=status.HTTP_200_OK)
async def health():
    return {"status": "ok", "service": "estimate-carbon"}

@router.post("/estimate-carbon/draw", response_model=CarbonEstimateResponse)
async def estimate_carbon_draw(payload: DynamicParcelRequest, db: Session = Depends(get_db)):
    logger.info("======================================================")
    logger.info("▶ PARCEL REGISTRATION & ANALYSIS INITIATED (%s)", payload.farm_id)
    logger.info("======================================================")

    try:
        # 1. High-Precision Geometry Validation
        geojson_geom = {"type": "Polygon", "coordinates": [payload.coordinates]}
        
        # Extract the geometry object and calculate area
        geom_obj, parcel_area_ha = validate_and_clean_geometry(geojson_geom)
        
        if not geom_obj:
            raise HTTPException(
                status_code=400, 
                detail="Invalid geometry. Ensure polygon is closed and non-intersecting."
            )

        # 🟢 Extract the Well-Known Text (WKT) string
        wkt_string = geom_obj.wkt if hasattr(geom_obj, 'wkt') else str(geom_obj)

        # 2. 🛡️ ANTI-FRAUD DOUBLE-COUNTING GATEKEEPER 
        logger.info("🛡️ Running PostGIS Anti-Fraud Overlap Check...")
        
        # Use the pure WKT string for PostGIS
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
                logger.warning(f"⛔ FRAUD ALERT: {overlap_pct:.1f}% overlap with parcel {existing_parcel.id}")
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail={
                        "error": "Spatial Overlap Detected",
                        "message": f"This boundary overlaps an existing registered carbon asset by {overlap_pct:.1f}%.",
                        "conflicting_parcel_uuid": str(existing_parcel.id)
                    }
                )
        logger.info("✅ Spatial Audit Passed: Polygon is unique.")

        # 3. Persist Spatial Data to PostGIS
        new_parcel = ParcelRecord(
            farm_id=payload.farm_id,
            boundary=wkt_string, 
            source_type=payload.source_type,
            calculated_area_ha=parcel_area_ha
        )
        db.add(new_parcel)
        db.commit()
        db.refresh(new_parcel)

        # 4. Multi-Sensor Analysis (GEE)
        logger.info("⏳ Sending geometry to Google Earth Engine...")
        gee_data = await run_in_threadpool(analyse_parcel, geojson_geom)
        
        # 5. Scientific Metrics Calculation (Sensor Fusion)
        # 🟢 THE FIX: Using exact kwarg names matching logic.py (veg_pixels, etc)
        results = run_carbon_pipeline(
            veg_pixels=gee_data.get("vegetation_pixel_count", gee_data.get("veg_pixels", 0)), 
            ndvi_mean=gee_data["ndvi_mean"],
            sar_vh=gee_data.get("sar_vh_backscatter", -20.0), 
            opt_imgs=gee_data.get("optical_images_used", gee_data.get("opt_imgs", 0)),
            rad_imgs=gee_data.get("radar_images_used", gee_data.get("rad_imgs", 0))
        )

        # 6. REAL Historical Trend Analysis (Additionality)
        logger.info("⏳ Fetching 5-Year Historical Baseline...")
        trends = []
        curr_year = int(datetime.now(timezone.utc).year)
        
        for year in range(curr_year - 4, curr_year + 1):
            hist_ndvi = await run_in_threadpool(get_historical_ndvi, geojson_geom, year)
            
            # Data-driven additionality proof
            hist_co2 = round(hist_ndvi * results["co2_equivalent_tons"] / max(0.01, gee_data["ndvi_mean"]), 2)
            
            trends.append({
                "year": year, 
                "carbon_tons": round(hist_co2 / 3.66, 2),
                "canopy_area_hectares": round(results["canopy_area_hectares"] * (hist_ndvi / max(0.01, gee_data["ndvi_mean"])), 2),
                "confidence_score": round(calculate_confidence_score(
                    gee_data.get("vegetation_pixel_count", gee_data.get("veg_pixels", 0)), 
                    gee_data.get("optical_images_used", gee_data.get("opt_imgs", 0)), 
                    gee_data.get("ndvi_std", 0.1)
                ) - (curr_year - year), 1)
            })

        # 7. REAL Confidence Score
        final_conf = calculate_confidence_score(
            gee_data.get("vegetation_pixel_count", gee_data.get("veg_pixels", 0)), 
            gee_data.get("optical_images_used", gee_data.get("opt_imgs", 0)), 
            gee_data.get("ndvi_std", 0.1)
        )

        # 8. Mint the Carbon Credit Ledger Entry
        cert_id = generate_credit_certificate(str(new_parcel.id), str(curr_year), results["co2_equivalent_tons"])
        
        new_credit = CarbonCredit(
            parcel_id=new_parcel.id,
            vintage_year=str(curr_year),
            unique_code=cert_id,
            estimated_co2e=results["co2_equivalent_tons"]
        )
        db.add(new_credit)
        db.commit()

        logger.info("✅ Ledger Entry Created: %s", cert_id)

        # 9. Compile Final Payload matching UI expectations
        return CarbonEstimateResponse(
            parcel_id=str(new_parcel.id),
            credit_certificate=cert_id,
            parcel_polygon=geojson_geom,
            
            parcel_area_hectares=parcel_area_ha,
            ndvi_mean=round(gee_data["ndvi_mean"], 3),
            ndvi_min=round(gee_data.get("ndvi_min", 0.0), 3),
            ndvi_max=round(gee_data.get("ndvi_max", 0.0), 3),
            vegetation_pixel_count=gee_data.get("vegetation_pixel_count", gee_data.get("veg_pixels", 0)),
            canopy_area_m2=results.get("canopy_area_m2", results["canopy_area_hectares"] * 10000),
            canopy_area_hectares=results["canopy_area_hectares"],
            biomass_density_tons_per_ha=results["biomass_density_tons_per_ha"],
            biomass_tons=results["biomass_tons"],
            carbon_tons=results["carbon_tons"],
            co2_equivalent_tons=results["co2_equivalent_tons"],
            
            confidence_score=final_conf,
            historical_trends=trends,
            
            satellite_dataset="Sentinel-2 L2A + Sentinel-1 SAR",
            optical_images_used=gee_data.get("optical_images_used", gee_data.get("opt_imgs", 0)),
            radar_images_used=gee_data.get("radar_images_used", gee_data.get("rad_imgs", 0)),
            fusion_ratio=results.get("fusion_ratio", "Optical 50% / Radar 50%"),
            image_count=results["image_count"],
            date_range={"start": str(curr_year - 4), "end": str(curr_year)}
        )

    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"Pipeline Error: {exc}", exc_info=True)
        raise HTTPException(status_code=500, detail="Unexpected error during processing.")