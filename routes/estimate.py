from __future__ import annotations
import logging
from datetime import datetime, timezone
from typing import Dict

from fastapi import APIRouter, HTTPException, Request, status, Depends
from starlette.concurrency import run_in_threadpool
import ee
from sqlalchemy.orm import Session



# Import your database and new services
from database.db import get_db
from database.models import ParcelRecord, CarbonCredit
from models.parcel import CarbonEstimateResponse, DynamicParcelRequest
from services.service import analyse_parcel
from utils.logic import run_carbon_pipeline
from services.geometry import process_dynamic_polygon
from services.ledger import generate_credit_certificate

logger = logging.getLogger("carbon_engine")
router = APIRouter(tags=["Carbon Estimation"])

@router.get("/health", status_code=status.HTTP_200_OK)
async def health() -> Dict[str, str]:
    return {"status": "ok", "service": "estimate-carbon"}

@router.post("/estimate-carbon/draw", response_model=CarbonEstimateResponse, status_code=status.HTTP_200_OK)
async def estimate_carbon_drawn(payload: DynamicParcelRequest, db: Session = Depends(get_db)):
    logger.info("======================================================")
    logger.info("▶ GPS POLYGON FETCH INITIATED (%s)", payload.source_type)
    logger.info("======================================================")

    try:
        # 1. Clean Geometry & Calculate Area (from our geometry service)
        wkt_polygon, parcel_area_ha = process_dynamic_polygon(payload.coordinates)
        
        # Format as GeoJSON for GEE
        geojson_geom = {"type": "Polygon", "coordinates": [payload.coordinates]}
        
        # 2. Persist Spatial Data to PostGIS
        new_parcel = ParcelRecord(
            farm_id=payload.farm_id,
            boundary=wkt_polygon,
            source_type=payload.source_type,
            calculated_area_ha=parcel_area_ha
        )
        db.add(new_parcel)
        db.commit()
        db.refresh(new_parcel)

        # 3. Trigger Google Earth Engine
        logger.info("⏳ Sending geometry to Google Earth Engine...")
        gee_result = await run_in_threadpool(analyse_parcel, geojson_geom)
        carbon_metrics = run_carbon_pipeline(vegetation_pixel_count=gee_result["vegetation_pixel_count"])

        # 4. Mint the Carbon Credit Ledger Entry
        vintage = datetime.now(timezone.utc).strftime("%Y")
        cert_id = generate_credit_certificate(str(new_parcel.id), vintage, carbon_metrics["co2_equivalent_tons"])
        
        new_credit = CarbonCredit(
            parcel_id=new_parcel.id,
            vintage_year=vintage,
            unique_code=cert_id,
            estimated_co2e=carbon_metrics["co2_equivalent_tons"]
        )
        db.add(new_credit)
        db.commit()

        logger.info("✅ Ledger Entry Created: %s", cert_id)

        return CarbonEstimateResponse(
            parcel_id=str(new_parcel.id),
            credit_certificate=cert_id,
            parcel_polygon=geojson_geom,
            parcel_area_hectares=parcel_area_ha,
            ndvi_mean=gee_result["ndvi_mean"],
            ndvi_min=gee_result["ndvi_min"],
            ndvi_max=gee_result["ndvi_max"],
            vegetation_pixel_count=gee_result["vegetation_pixel_count"],
            canopy_area_m2=carbon_metrics["canopy_area_m2"],
            canopy_area_hectares=carbon_metrics["canopy_area_hectares"],
            biomass_density_tons_per_ha=carbon_metrics["biomass_density_tons_per_ha"],
            biomass_tons=carbon_metrics["biomass_tons"],
            carbon_tons=carbon_metrics["carbon_tons"],
            co2_equivalent_tons=carbon_metrics["co2_equivalent_tons"],
            satellite_dataset="COPERNICUS/S2_SR",
            image_count=gee_result["image_count"],
            date_range=gee_result["date_range"],
        )

    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        logger.error(f"Pipeline Error: {exc}")
        raise HTTPException(status_code=500, detail="Unexpected error during processing.")