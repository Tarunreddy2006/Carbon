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

class HistoricalDataPoint(BaseModel):
    """Represents a single year of historical additionality data."""
    year: int
    carbon_tons: float
    canopy_area_hectares: float
    confidence_score: float

class CarbonEstimateResponse(BaseModel):
    """Final output minted to the ledger and sent to the frontend."""
    parcel_id: str
    credit_certificate: str
    parcel_polygon: Dict[str, Any]
    
    # Core Metrics
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
    
    # 🟢 NEW: Market Confidence & History
    confidence_score: float
    historical_trends: List[HistoricalDataPoint]
    
    # Provenance
    satellite_dataset: str
    optical_images_used: int
    radar_images_used: int
    fusion_ratio: str
    date_range: Dict[str, str]
    image_count: int

class ErrorResponse(BaseModel):
    """Standard error envelope returned on 4xx / 5xx responses."""
    status: str = Field(default="error")
    code: int
    message: str
    detail: Optional[str] = None