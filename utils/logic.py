"""
utils/calculations.py
─────────────────────────────────────────────────────────────────────────────
Pure-function calculation layer for the Carbon Biomass Intelligence Engine.

All functions are side-effect free and fully unit-testable.  No I/O, no GEE
calls.  Each function documents its formula, units, and assumptions so that
the scientific methodology is auditable.
─────────────────────────────────────────────────────────────────────────────
"""

from __future__ import annotations

import math
from typing import List, Tuple

from shapely.geometry import shape, Polygon as ShapelyPolygon


# ─── Constants ────────────────────────────────────────────────────────────────

# Sentinel-2 spatial resolution: 10 m × 10 m per pixel for bands B4 & B8
SENTINEL2_PIXEL_AREA_M2: float = 100.0          # m² / pixel

# NDVI threshold above which a pixel is classified as "vegetated"
NDVI_VEGETATION_THRESHOLD: float = 0.4

# ── Biomass / carbon factors ──────────────────────────────────────────────────
# BiomassDensity: conservative estimate for tropical / semi-arid mixed
# vegetation in southern India (Tier-1 IPCC default for tropical moist forest
# is ~190 t/ha; we use 120 t/ha as a broad-cropland / mixed-land factor).
# REPLACE with species-specific allometric equations for production use.
DEFAULT_BIOMASS_DENSITY_TONS_PER_HA: float = 120.0

# Carbon fraction of dry biomass (IPCC 2006 GL, Table 4.3 – generic = 0.47;
# rounded to 0.50 for simplicity as the specification requires).
CARBON_FRACTION: float = 0.50

# CO₂-to-C molecular weight ratio: 44 / 12 ≈ 3.667
CO2_TO_C_RATIO: float = 44.0 / 12.0            # ≈ 3.6667


# ─── Geometry helpers ─────────────────────────────────────────────────────────

def geojson_polygon_to_shapely(geojson_geometry: dict) -> ShapelyPolygon:
    """
    Convert a GeoJSON geometry dict (type="Polygon") to a Shapely Polygon.

    Parameters
    ----------
    geojson_geometry : dict
        A dict with keys "type" and "coordinates" following the GeoJSON spec.

    Returns
    -------
    ShapelyPolygon
    """
    return shape(geojson_geometry)


def compute_parcel_area_hectares(geojson_geometry: dict) -> float:
    """
    Compute the geodetic area of a GeoJSON Polygon in hectares.

    Implementation note
    ───────────────────
    Shapely's `.area` property operates in the *coordinate reference system*
    of the geometry.  For WGS-84 lon/lat coordinates the raw value is in
    square degrees, which is meaningless.

    Production approach: project to an equal-area CRS (e.g. EPSG:32643 –
    UTM Zone 43N, which covers Karnataka) before computing area.

    For an MVP with small parcels we use an approximate spherical excess
    formula instead to avoid adding pyproj as a hard dependency.  Swap this
    for pyproj / geopandas in a production system.

    Parameters
    ----------
    geojson_geometry : dict
        GeoJSON Polygon geometry in WGS-84.

    Returns
    -------
    float
        Approximate parcel area in hectares.
    """
    polygon: ShapelyPolygon = geojson_polygon_to_shapely(geojson_geometry)
    coords: List[Tuple[float, float]] = list(polygon.exterior.coords)

    # Shoelace formula on (lon, lat) → result in square degrees.
    # Convert to m² using the mid-latitude scale factor:
    #   1 degree latitude  ≈ 111_320 m
    #   1 degree longitude ≈ 111_320 × cos(lat_mid) m
    lats = [c[1] for c in coords]
    lat_mid_rad = math.radians(sum(lats) / len(lats))

    m_per_deg_lat = 111_320.0
    m_per_deg_lon = 111_320.0 * math.cos(lat_mid_rad)

    area_deg2 = abs(polygon.area)                   # in square degrees
    area_m2   = area_deg2 * m_per_deg_lat * m_per_deg_lon
    area_ha   = area_m2 / 10_000.0

    return round(area_ha, 4)


# ─── Vegetation / canopy metrics ──────────────────────────────────────────────

def compute_canopy_area(
    vegetation_pixel_count: int,
    pixel_area_m2: float = SENTINEL2_PIXEL_AREA_M2,
) -> Tuple[float, float]:
    """
    Compute canopy (vegetated) area from a pixel count.

    Formula
    ───────
        CanopyArea_m²  = vegetation_pixel_count × pixel_area_m²
        CanopyArea_ha  = CanopyArea_m² / 10 000

    Parameters
    ----------
    vegetation_pixel_count : int
        Number of pixels whose NDVI > NDVI_VEGETATION_THRESHOLD.
    pixel_area_m2 : float
        Area represented by one satellite pixel (default 100 m² for S2 B4/B8).

    Returns
    -------
    (area_m2, area_ha) : Tuple[float, float]
    """
    area_m2 = vegetation_pixel_count * pixel_area_m2
    area_ha = area_m2 / 10_000.0
    return round(area_m2, 2), round(area_ha, 4)


# ─── Biomass estimation ───────────────────────────────────────────────────────

def estimate_biomass(
    canopy_area_ha: float,
    biomass_density_tons_per_ha: float = DEFAULT_BIOMASS_DENSITY_TONS_PER_HA,
) -> float:
    """
    Estimate above-ground biomass using an area-weighted density factor.

    Formula
    ───────
        Biomass (t) = CanopyArea_ha × BiomassDensity (t/ha)

    Scientific note
    ───────────────
    For production deployments this should be replaced with species-specific
    allometric equations (e.g. Chave et al. 2014 pantropical equations) driven
    by wood density and tree height derived from LiDAR or TanDEM-X data.

    Parameters
    ----------
    canopy_area_ha : float
        Vegetated canopy area in hectares.
    biomass_density_tons_per_ha : float
        Biomass per unit area (metric tonnes / ha).

    Returns
    -------
    float
        Estimated biomass in metric tonnes.
    """
    return round(canopy_area_ha * biomass_density_tons_per_ha, 2)


# ─── Carbon estimation ────────────────────────────────────────────────────────

def estimate_carbon(biomass_tons: float, carbon_fraction: float = CARBON_FRACTION) -> float:
    """
    Estimate carbon stock from biomass using a fixed carbon fraction.

    Formula
    ───────
        Carbon (t C) = Biomass (t) × CarbonFraction

    The carbon fraction accounts for the fact that dry wood / plant matter is
    approximately 47–50 % carbon by mass (IPCC 2006 Guidelines Vol. 4).

    Parameters
    ----------
    biomass_tons : float
        Estimated biomass in metric tonnes.
    carbon_fraction : float
        Fraction of biomass that is carbon (default 0.50).

    Returns
    -------
    float
        Estimated carbon stock in metric tonnes of carbon (t C).
    """
    return round(biomass_tons * carbon_fraction, 2)


def estimate_co2_equivalent(carbon_tons: float, ratio: float = CO2_TO_C_RATIO) -> float:
    """
    Convert carbon stock to CO₂ equivalent.

    Formula
    ───────
        CO₂e (t) = Carbon (t C) × (44 / 12)

    Rationale
    ─────────
    Carbon dioxide (CO₂) has a molecular weight of 44 g/mol; carbon (C) has
    12 g/mol.  When carbon is sequestered in biomass it displaces CO₂ from
    the atmosphere at a mass ratio of 44:12 ≈ 3.667.

    Parameters
    ----------
    carbon_tons : float
        Carbon stock in metric tonnes of carbon.
    ratio : float
        CO₂-to-C molecular weight ratio (default ≈ 3.667).

    Returns
    -------
    float
        CO₂ equivalent in metric tonnes (t CO₂e).
    """
    return round(carbon_tons * ratio, 2)


# ─── Convenience pipeline ─────────────────────────────────────────────────────

def run_carbon_pipeline(
    vegetation_pixel_count: int,
    biomass_density_tons_per_ha: float = DEFAULT_BIOMASS_DENSITY_TONS_PER_HA,
    carbon_fraction: float = CARBON_FRACTION,
    co2_ratio: float = CO2_TO_C_RATIO,
) -> dict:
    """
    Execute the full biomass → carbon → CO₂e pipeline in one call.

    Returns a dict with all intermediate and final values so they can be
    included in the API response for full auditability.
    """
    area_m2, area_ha      = compute_canopy_area(vegetation_pixel_count)
    biomass               = estimate_biomass(area_ha, biomass_density_tons_per_ha)
    carbon                = estimate_carbon(biomass, carbon_fraction)
    co2e                  = estimate_co2_equivalent(carbon, co2_ratio)

    return {
        "canopy_area_m2":              area_m2,
        "canopy_area_hectares":        area_ha,
        "biomass_density_tons_per_ha": biomass_density_tons_per_ha,
        "biomass_tons":                biomass,
        "carbon_tons":                 carbon,
        "co2_equivalent_tons":         co2e,
    }
