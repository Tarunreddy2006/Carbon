"""
routes/estimate.py
─────────────────────────────────────────────────────────────────────────────
FastAPI router – Carbon estimation endpoint.

Endpoint
────────
    POST /estimate-carbon

Flow
────
    1. Validate the cadastral request payload (Pydantic).
    2. Look up the parcel boundary → GeoJSON Polygon.
    3. Call the GEE service → NDVI stats + vegetation pixel count.
    4. Run the carbon pipeline calculations.
    5. Assemble and return the response.

Error handling
──────────────
    • 422 – request validation (auto-handled by FastAPI / Pydantic)
    • 404 – parcel not found / empty geometry
    • 502 – GEE upstream error
    • 500 – unexpected server error
─────────────────────────────────────────────────────────────────────────────
"""

from __future__ import annotations

import logging
from typing import Any, Dict

from fastapi import APIRouter, HTTPException, Request, status
from fastapi.responses import JSONResponse

import ee

from models.parcel import CarbonEstimateResponse, ParcelRequest
from services.lookup import build_parcel_id, get_parcel_boundary
from services.service import analyse_parcel
from utils.logic import (
    compute_parcel_area_hectares,
    run_carbon_pipeline,
)

logger  = logging.getLogger(__name__)
router  = APIRouter(prefix="/estimate-carbon", tags=["Carbon Estimation"])


# ─── Health-check sub-route ───────────────────────────────────────────────────

@router.get(
    "/health",
    summary="Liveness probe for the estimation service",
    status_code=status.HTTP_200_OK,
)
async def health() -> Dict[str, str]:
    return {"status": "ok", "service": "estimate-carbon"}


# ─── Main estimation endpoint ─────────────────────────────────────────────────

@router.post(
    "",
    response_model=CarbonEstimateResponse,
    summary="Estimate carbon storage for a land parcel",
    response_description=(
        "Full carbon estimation result including NDVI stats, canopy area, "
        "biomass, carbon stock, and CO₂ equivalent."
    ),
    status_code=status.HTTP_200_OK,
)
async def estimate_carbon(
    payload: ParcelRequest,
    request: Request,
) -> CarbonEstimateResponse:
    """
    ## Carbon Biomass Intelligence Engine – Estimation Pipeline

    ### Input
    Provide the cadastral hierarchy that uniquely identifies the land parcel
    in Karnataka's revenue records (Bhoomi / RTC system).

    ### Processing
    1. **Parcel lookup** – retrieve the boundary polygon from Bhoomi API
       (or simulation layer for MVP).
    2. **Satellite imagery** – load Sentinel-2 SR collection (last 12 months,
       cloud cover < 20 %) from Google Earth Engine.
    3. **NDVI computation** – median composite NDVI = (B8 − B4) / (B8 + B4).
    4. **Vegetation mask** – pixels with NDVI > 0.4 classified as vegetated.
    5. **Canopy area** – pixel count × 100 m² → hectares.
    6. **Biomass** – canopy area × 120 t/ha density factor.
    7. **Carbon** – biomass × 0.50 carbon fraction.
    8. **CO₂e** – carbon × 3.667 (44/12 molecular weight ratio).

    ### Output
    Full result object with all intermediate values for auditability.
    """
    parcel_id = build_parcel_id(payload)
    logger.info("▶ /estimate-carbon  parcel_id=%s  remote=%s",
                parcel_id, request.client.host)

    # ── Step 1: Parcel boundary ───────────────────────────────────────────
    try:
        geojson_geom: Dict[str, Any] = await get_parcel_boundary(payload)
    except Exception as exc:
        logger.error("Parcel lookup failed: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Could not retrieve parcel boundary for '{parcel_id}': {exc}",
        ) from exc

    if not geojson_geom or not geojson_geom.get("coordinates"):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Empty geometry returned for parcel '{parcel_id}'.",
        )

    # ── Step 2: Compute parcel total area from geometry ───────────────────
    try:
        parcel_area_ha = compute_parcel_area_hectares(geojson_geom)
    except Exception as exc:
        logger.warning("Area computation failed (%s); using 0.0", exc)
        parcel_area_ha = 0.0

    # ── Step 3: GEE – NDVI + vegetation pixel count ───────────────────────
    try:
        gee_result = analyse_parcel(geojson_geom)
    except RuntimeError as exc:
        # No cloud-free scenes found
        logger.warning("GEE RuntimeError: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
    except ee.EEException as exc:
        logger.error("GEE EEException: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Google Earth Engine error: {exc}",
        ) from exc
    except Exception as exc:
        logger.error("Unexpected GEE error: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unexpected error during satellite image analysis.",
        ) from exc

    # ── Step 4–8: Carbon calculation pipeline ────────────────────────────
    carbon_metrics = run_carbon_pipeline(
        vegetation_pixel_count=gee_result["vegetation_pixel_count"]
    )

    # ── Assemble response ─────────────────────────────────────────────────
    response = CarbonEstimateResponse(
        # Identity
        parcel_id              = parcel_id,
        # Geometry
        parcel_polygon         = geojson_geom,
        parcel_area_hectares   = parcel_area_ha,
        # Spectral
        ndvi_mean              = gee_result["ndvi_mean"],
        ndvi_min               = gee_result["ndvi_min"],
        ndvi_max               = gee_result["ndvi_max"],
        # Vegetation
        vegetation_pixel_count = gee_result["vegetation_pixel_count"],
        canopy_area_m2         = carbon_metrics["canopy_area_m2"],
        canopy_area_hectares   = carbon_metrics["canopy_area_hectares"],
        # Carbon pipeline
        biomass_density_tons_per_ha = carbon_metrics["biomass_density_tons_per_ha"],
        biomass_tons           = carbon_metrics["biomass_tons"],
        carbon_tons            = carbon_metrics["carbon_tons"],
        co2_equivalent_tons    = carbon_metrics["co2_equivalent_tons"],
        # Provenance
        satellite_dataset      = "COPERNICUS/S2_SR",
        image_count            = gee_result["image_count"],
        date_range             = gee_result["date_range"],
    )

    logger.info(
        "✔ Estimation complete  parcel=%s  ndvi=%.3f  co2e=%.1f t",
        parcel_id, response.ndvi_mean, response.co2_equivalent_tons
    )
    return response


# ─── Demo / dry-run endpoint (no GEE call) ────────────────────────────────────

@router.post(
    "/demo",
    summary="Dry-run estimation using hardcoded sample values (no GEE call)",
    status_code=status.HTTP_200_OK,
)
async def estimate_carbon_demo(payload: ParcelRequest) -> CarbonEstimateResponse:
    """
    Returns a realistic demo response without calling Google Earth Engine.
    Useful for frontend development and integration testing.
    """
    parcel_id = build_parcel_id(payload)

    demo_geom = {
        "type": "Polygon",
        "coordinates": [[
            [76.655, 12.135],
            [76.667, 12.135],
            [76.667, 12.145],
            [76.655, 12.145],
            [76.655, 12.135],
        ]],
    }

    # Simulate ~82 vegetation pixels at 10 m × 10 m = 0.82 ha
    demo_veg_pixels = 82
    carbon_metrics  = run_carbon_pipeline(demo_veg_pixels)
    parcel_area_ha  = compute_parcel_area_hectares(demo_geom)

    from datetime import datetime, timedelta
    end_dt   = datetime.utcnow()
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
        date_range             = {
            "start": start_dt.strftime("%Y-%m-%d"),
            "end":   end_dt.strftime("%Y-%m-%d"),
        },
    )
