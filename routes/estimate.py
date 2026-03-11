from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict

from fastapi import APIRouter, HTTPException, Request, status
from starlette.concurrency import run_in_threadpool
import ee
import ee.ee_exception

from models.parcel import CarbonEstimateResponse, ParcelRequest
from services.lookup import build_parcel_id, get_parcel_boundary
from services.service import analyse_parcel
from utils.logic import compute_parcel_area_hectares, run_carbon_pipeline

logger  = logging.getLogger(__name__)

# Removed the strict prefix to explicitly define paths and avoid 
# FastAPI 307 Redirects or trailing-slash ("/" vs "") configuration bugs.
router  = APIRouter(tags=["Carbon Estimation"])

@router.get("/health", status_code=status.HTTP_200_OK)
async def health() -> Dict[str, str]:
    return {"status": "ok", "service": "estimate-carbon"}

@router.post("/estimate-carbon", response_model=CarbonEstimateResponse, status_code=status.HTTP_200_OK)
async def estimate_carbon(payload: ParcelRequest, request: Request) -> CarbonEstimateResponse:
    parcel_id = build_parcel_id(payload)
    client_ip = request.client.host if request.client else "unknown"
    logger.info("▶ /estimate-carbon  parcel_id=%s  remote=%s", parcel_id, client_ip)

    try:
        geojson_geom: Dict[str, Any] = await run_in_threadpool(get_parcel_boundary, payload)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Could not retrieve parcel boundary for '{parcel_id}': {exc}",
        ) from exc

    if not geojson_geom or not geojson_geom.get("coordinates"):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Empty geometry returned for parcel '{parcel_id}'.",
        )

    try:
        parcel_area_ha = compute_parcel_area_hectares(geojson_geom)
    except Exception:
        parcel_area_ha = 0.0

    try:
        gee_result = await run_in_threadpool(analyse_parcel, geojson_geom)
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    except ee.ee_exception.EEException as exc: # Safely explicit exception class
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"GEE error: {exc}") from exc
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Unexpected GEE error.") from exc

    carbon_metrics = run_carbon_pipeline(vegetation_pixel_count=gee_result["vegetation_pixel_count"])

    return CarbonEstimateResponse(
        parcel_id              = parcel_id,
        parcel_polygon         = geojson_geom,
        parcel_area_hectares   = parcel_area_ha,
        ndvi_mean              = gee_result["ndvi_mean"],
        ndvi_min               = gee_result["ndvi_min"],
        ndvi_max               = gee_result["ndvi_max"],
        vegetation_pixel_count = gee_result["vegetation_pixel_count"],
        canopy_area_m2         = carbon_metrics["canopy_area_m2"],
        canopy_area_hectares   = carbon_metrics["canopy_area_hectares"],
        biomass_density_tons_per_ha = carbon_metrics["biomass_density_tons_per_ha"],
        biomass_tons           = carbon_metrics["biomass_tons"],
        carbon_tons            = carbon_metrics["carbon_tons"],
        co2_equivalent_tons    = carbon_metrics["co2_equivalent_tons"],
        satellite_dataset      = "COPERNICUS/S2_SR",
        image_count            = gee_result["image_count"],
        date_range             = gee_result["date_range"],
    )

@router.post("/estimate-carbon/demo", response_model=CarbonEstimateResponse, status_code=status.HTTP_200_OK)
async def estimate_carbon_demo(payload: ParcelRequest) -> CarbonEstimateResponse:
    parcel_id = build_parcel_id(payload)
    demo_geom = {"type": "Polygon", "coordinates": [[[76.655, 12.135], [76.667, 12.135], [76.667, 12.145], [76.655, 12.145], [76.655, 12.135]]]}
    demo_veg_pixels = 82
    carbon_metrics  = run_carbon_pipeline(demo_veg_pixels)
    parcel_area_ha  = compute_parcel_area_hectares(demo_geom)

    end_dt   = datetime.now(timezone.utc)
    start_dt = end_dt - timedelta(days=365)

    return CarbonEstimateResponse(
        parcel_id              = parcel_id,
        parcel_polygon         = demo_geom,
        parcel_area_hectares   = parcel_area_ha,
        ndvi_mean              = 0.63,
        ndvi_min               = 0.21,
        ndvi_max               = 0.87,
        vegetation_pixel_count = demo_veg_pixels,
        canopy_area_m2         = carbon_metrics["canopy_area_m2"],
        canopy_area_hectares   = carbon_metrics["canopy_area_hectares"],
        biomass_density_tons_per_ha = carbon_metrics["biomass_density_tons_per_ha"],
        biomass_tons           = carbon_metrics["biomass_tons"],
        carbon_tons            = carbon_metrics["carbon_tons"],
        co2_equivalent_tons    = carbon_metrics["co2_equivalent_tons"],
        satellite_dataset      = "COPERNICUS/S2_SR (demo)",
        image_count            = 14,
        date_range             = {"start": start_dt.strftime("%Y-%m-%d"), "end": end_dt.strftime("%Y-%m-%d")},
    )