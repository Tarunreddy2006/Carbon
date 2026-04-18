"""
models/parcel.py
─────────────────────────────────────────────────────────────────────────────
Pydantic models for the Carbon Biomass Intelligence Engine.
─────────────────────────────────────────────────────────────────────────────
"""
from __future__ import annotations
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field

# ─── Request ─────────────────────────────────────────────────────────────────

class DynamicParcelRequest(BaseModel):
    """Payload for GPS-walked or manually drawn polygons."""
    farm_id: str = Field(default="UNKNOWN_FARM")
    source_type: str = Field(default="GPS_WALK")
    coordinates: List[List[float]] = Field(
        ..., 
        description="Array of [longitude, latitude] coordinates forming the boundary"
    )

# ─── Response ─────────────────────────────────────────────────────────────────

class CarbonEstimateResponse(BaseModel):
    parcel_id: str
    credit_certificate: str
    parcel_polygon: Dict[str, Any]
    parcel_area_hectares: float
    ndvi_mean: float
    ndvi_min: float
    ndvi_max: float
    vegetation_pixel_count: int
    canopy_area_m2: float
    canopy_area_hectares: float
    biomass_density_tons_per_ha: float
    biomass_tons: float
    carbon_tons: float
    co2_equivalent_tons: float
    satellite_dataset: str
    image_count: int
    date_range: Dict[str, str]

class ErrorResponse(BaseModel):
    """Standard error envelope returned on 4xx / 5xx responses."""
    status: str = Field(default="error")
    code: int
    message: str
    detail: Optional[str] = None