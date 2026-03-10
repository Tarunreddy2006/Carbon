"""
models/parcel.py
─────────────────────────────────────────────────────────────────────────────
Pydantic models for the Carbon Biomass Intelligence Engine.

All request / response schemas are defined here so that FastAPI can:
  • Auto-validate incoming JSON payloads
  • Auto-generate OpenAPI / Swagger documentation
  • Serialise outgoing responses cleanly
─────────────────────────────────────────────────────────────────────────────
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field, field_validator


# ─── Request ─────────────────────────────────────────────────────────────────

class ParcelRequest(BaseModel):
    """
    Land parcel identification payload submitted by the client.

    Maps directly to the cadastral hierarchy used by Karnataka's
    Bhoomi land-record system:
        State → District → Taluk → Hobli → Village → Survey No. → Hissa
    """

    state: str = Field(
        ...,
        min_length=2,
        example="Karnataka",
        description="Indian state name"
    )
    district: str = Field(
        ...,
        min_length=2,
        example="Mysuru",
        description="Revenue district"
    )
    taluk: str = Field(
        ...,
        min_length=2,
        example="Nanjangud",
        description="Taluk (sub-district) name"
    )
    hobli: Optional[str] = Field(
        default=None,
        example="Nanjangud",
        description="Hobli (revenue circle) – optional but improves lookup precision"
    )
    village: str = Field(
        ...,
        min_length=2,
        example="Somanahalli",
        description="Revenue village name"
    )
    survey_no: str = Field(
        ...,
        min_length=1,
        example="45",
        description="Survey / Khasra number"
    )
    hissa: Optional[str] = Field(
        default=None,
        example="2",
        description="Sub-division (hissa) of the survey number"
    )

    @field_validator("state")
    @classmethod
    def normalise_state(cls, v: str) -> str:
        return v.strip().title()

    @field_validator("district", "taluk", "village")
    @classmethod
    def normalise_names(cls, v: str) -> str:
        return v.strip().title()


# ─── Internal domain objects ──────────────────────────────────────────────────

class ParcelGeometry(BaseModel):
    """
    GeoJSON Polygon representing the parcel boundary returned by the
    land-lookup service.  Stored as a plain dict to stay JSON-serialisable
    without extra dependencies.
    """
    type: str = Field(default="Polygon")
    coordinates: List[List[List[float]]]   # [ [ [lon, lat], … ] ]


class NDVIStats(BaseModel):
    """Statistics derived from the NDVI raster computed over the parcel."""
    mean: float = Field(..., description="Mean NDVI across all valid pixels")
    min: float  = Field(..., description="Minimum NDVI value in the parcel")
    max: float  = Field(..., description="Maximum NDVI value in the parcel")
    vegetation_pixel_count: int = Field(
        ..., description="Number of pixels with NDVI > 0.4 (vegetation mask)"
    )


# ─── Response ─────────────────────────────────────────────────────────────────

class CarbonEstimateResponse(BaseModel):
    """
    Full carbon-estimation result returned by POST /estimate-carbon.

    All area figures are in SI units; biomass/carbon/CO₂ are metric tonnes.
    """

    # ── Parcel identity ──────────────────────────────────────────────────────
    parcel_id: str = Field(
        ...,
        description="Canonical identifier assembled from the cadastral hierarchy"
    )

    # ── Geometry ─────────────────────────────────────────────────────────────
    parcel_polygon: Dict[str, Any] = Field(
        ...,
        description="GeoJSON Polygon of the parcel boundary"
    )
    parcel_area_hectares: float = Field(
        ...,
        description="Total parcel area in hectares (from polygon geometry)"
    )

    # ── Spectral / vegetation metrics ────────────────────────────────────────
    ndvi_mean: float = Field(
        ...,
        ge=-1.0,
        le=1.0,
        description="Mean NDVI value over the parcel (cloud-filtered composite)"
    )
    ndvi_min: float = Field(..., ge=-1.0, le=1.0)
    ndvi_max: float = Field(..., ge=-1.0, le=1.0)

    # ── Vegetation / canopy ───────────────────────────────────────────────────
    vegetation_pixel_count: int = Field(
        ...,
        ge=0,
        description="Sentinel-2 pixels (10 m × 10 m) classified as vegetated"
    )
    canopy_area_m2: float = Field(
        ..., ge=0, description="Canopy area in square metres"
    )
    canopy_area_hectares: float = Field(
        ..., ge=0, description="Canopy area in hectares"
    )

    # ── Carbon pipeline ───────────────────────────────────────────────────────
    biomass_density_tons_per_ha: float = Field(
        ...,
        description="Biomass density factor applied (tons / hectare)"
    )
    biomass_tons: float = Field(
        ..., ge=0, description="Estimated above-ground biomass (metric tonnes)"
    )
    carbon_tons: float = Field(
        ..., ge=0, description="Estimated carbon stock (metric tonnes C)"
    )
    co2_equivalent_tons: float = Field(
        ..., ge=0, description="CO₂ equivalent (metric tonnes CO₂e)"
    )

    # ── Data provenance ───────────────────────────────────────────────────────
    satellite_dataset: str = Field(
        default="COPERNICUS/S2_SR",
        description="Google Earth Engine dataset used"
    )
    image_count: int = Field(
        ...,
        description="Number of cloud-filtered Sentinel-2 scenes composited"
    )
    date_range: Dict[str, str] = Field(
        ...,
        description="Start / end dates of the satellite image search window"
    )


class ErrorResponse(BaseModel):
    """Standard error envelope returned on 4xx / 5xx responses."""
    status: str = Field(default="error")
    code: int
    message: str
    detail: Optional[str] = None
