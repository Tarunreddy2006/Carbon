"""
services/gee_service.py
─────────────────────────────────────────────────────────────────────────────
Google Earth Engine (GEE) integration layer.

Responsibilities
────────────────
1. Authenticate with GEE once per process lifetime (lazy init + singleton).
2. Accept a GeoJSON Polygon and a date range.
3. Load and cloud-filter Sentinel-2 Surface Reflectance imagery.
4. Compute per-pixel NDVI = (B8 − B4) / (B8 + B4).
5. Apply a vegetation mask (NDVI > 0.4).
6. Aggregate statistics over the parcel geometry.
7. Return a structured dict consumed by the route layer.

Design notes
────────────
• All GEE operations run *server-side* (deferred computation graph); we only
  pull scalars (reduceRegion results) back to the Python process.
• The service is stateless: no objects are cached between requests.
• Authentication is handled once at startup via ``initialise_gee()``.
─────────────────────────────────────────────────────────────────────────────
"""

from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta
from functools import lru_cache
from typing import Any, Dict, Tuple

import ee

logger = logging.getLogger(__name__)

# ─── GEE Dataset constants ────────────────────────────────────────────────────

SENTINEL2_DATASET    = "COPERNICUS/S2_SR"          # Surface Reflectance L2A
CLOUD_PROB_DATASET   = "COPERNICUS/S2_CLOUD_PROBABILITY"
MAX_CLOUD_PERCENTAGE = 20                          # filter at collection level
NDVI_THRESHOLD       = 0.4                         # vegetation mask cut-off

# Sentinel-2 band names for NDVI
BAND_RED  = "B4"    # Red      – 665 nm, 10 m
BAND_NIR  = "B8"    # NIR      – 842 nm, 10 m
BAND_SCL  = "SCL"   # Scene Classification Layer (cloud flags)

SCALE_METRES = 10   # native S2 resolution for B4 / B8


# ─── Authentication ───────────────────────────────────────────────────────────

@lru_cache(maxsize=1)
def initialise_gee() -> None:
    """
    Authenticate and initialise the Earth Engine API.

    Called once per process.  ``lru_cache`` ensures subsequent calls are
    no-ops.

    Authentication strategy (in priority order):
      1. Service account  – set GEE_USE_SERVICE_ACCOUNT=true and supply
                            GEE_SERVICE_ACCOUNT + GEE_KEY_FILE in .env.
      2. Application Default Credentials – works inside GCP / Vertex AI.
      3. Persistent credentials written by `earthengine authenticate`
         (developer workstation).

    Raises
    ------
    ee.EEException
        If authentication or project initialisation fails.
    """
    project_id           = os.getenv("GEE_PROJECT_ID", "")
    use_service_account  = os.getenv("GEE_USE_SERVICE_ACCOUNT", "false").lower() == "true"
    service_account      = os.getenv("GEE_SERVICE_ACCOUNT", "")
    key_file             = os.getenv("GEE_KEY_FILE", "")

    if use_service_account and service_account and key_file:
        logger.info("GEE: authenticating with service account %s", service_account)
        credentials = ee.ServiceAccountCredentials(service_account, key_file)
        ee.Initialize(credentials=credentials, project=project_id)
    else:
        logger.info("GEE: authenticating with application default / stored credentials")
        ee.Initialize(project=project_id or None)

    logger.info("Google Earth Engine initialised (project=%s)", project_id or "default")


# ─── Image collection helpers ─────────────────────────────────────────────────

def _build_date_range(months_back: int = 12) -> Tuple[str, str]:
    """Return (start_date, end_date) ISO strings covering the last N months."""
    end_dt   = datetime.utcnow()
    start_dt = end_dt - timedelta(days=months_back * 30)
    return start_dt.strftime("%Y-%m-%d"), end_dt.strftime("%Y-%m-%d")


def _mask_clouds_s2(image: ee.Image) -> ee.Image:
    """
    Mask cloud and cloud-shadow pixels using the Sentinel-2 Scene
    Classification Layer (SCL band).

    SCL values considered non-vegetated / contaminated:
      3  = Cloud shadows
      8  = Cloud (medium probability)
      9  = Cloud (high probability)
      10 = Thin cirrus
    """
    scl       = image.select(BAND_SCL)
    clear     = (
        scl.neq(3)
        .And(scl.neq(8))
        .And(scl.neq(9))
        .And(scl.neq(10))
    )
    return image.updateMask(clear)


def _compute_ndvi(image: ee.Image) -> ee.Image:
    """
    Add an NDVI band to the image.

    Formula
    ───────
        NDVI = (NIR − Red) / (NIR + Red)
               (B8  −  B4) / (B8  +  B4)

    NDVI ranges from −1 (open water / bare rock) to +1 (dense vegetation).
    Agricultural crops typically score 0.2–0.5; dense forest 0.5–0.9.

    S2 SR pixel values are scaled by 10 000 (reflectance × 10⁴), so we
    normalise to [0, 1] first.
    """
    red  = image.select(BAND_RED).divide(10_000)
    nir  = image.select(BAND_NIR).divide(10_000)
    ndvi = nir.subtract(red).divide(nir.add(red)).rename("NDVI")
    return image.addBands(ndvi)


def _load_sentinel2_collection(
    geometry: ee.Geometry,
    start_date: str,
    end_date: str,
) -> ee.ImageCollection:
    """
    Load a cloud-filtered, NDVI-enriched Sentinel-2 image collection.

    Steps
    ─────
    1. Filter by date range.
    2. Filter by geometry (only scenes intersecting the parcel).
    3. Pre-filter by the metadata cloud percentage attribute.
    4. Apply per-pixel cloud mask via SCL.
    5. Compute NDVI for every scene.
    """
    collection = (
        ee.ImageCollection(SENTINEL2_DATASET)
        .filterDate(start_date, end_date)
        .filterBounds(geometry)
        .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", MAX_CLOUD_PERCENTAGE))
        .map(_mask_clouds_s2)
        .map(_compute_ndvi)
    )
    return collection


# ─── Statistics helpers ───────────────────────────────────────────────────────

def _reduce_ndvi_stats(
    ndvi_image: ee.Image,
    geometry: ee.Geometry,
    scale: int = SCALE_METRES,
) -> Dict[str, float]:
    """
    Compute mean / min / max NDVI over the parcel geometry.

    ``ee.Reducer.minMax()`` combined with ``mean()`` run server-side; only
    the result dict is transferred to the Python client.
    """
    stats = ndvi_image.select("NDVI").reduceRegion(
        reducer  = ee.Reducer.mean()
                    .combine(ee.Reducer.min(),  sharedInputs=True)
                    .combine(ee.Reducer.max(),  sharedInputs=True),
        geometry = geometry,
        scale    = scale,
        maxPixels= 1e9,
    ).getInfo()

    return {
        "mean": round(stats.get("NDVI_mean", 0.0) or 0.0, 4),
        "min":  round(stats.get("NDVI_min",  0.0) or 0.0, 4),
        "max":  round(stats.get("NDVI_max",  0.0) or 0.0, 4),
    }


def _count_vegetation_pixels(
    ndvi_image: ee.Image,
    geometry: ee.Geometry,
    threshold: float = NDVI_THRESHOLD,
    scale: int = SCALE_METRES,
) -> int:
    """
    Count pixels with NDVI above the vegetation threshold.

    Strategy
    ────────
    1. Threshold the NDVI band → binary mask (0 / 1).
    2. Sum all 1-valued pixels inside the geometry.
    3. The sum equals the vegetation pixel count.
    """
    veg_mask  = ndvi_image.select("NDVI").gt(threshold).rename("veg")
    pixel_sum = veg_mask.reduceRegion(
        reducer  = ee.Reducer.sum(),
        geometry = geometry,
        scale    = scale,
        maxPixels= 1e9,
    ).getInfo()

    return int(pixel_sum.get("veg", 0) or 0)


# ─── Public interface ─────────────────────────────────────────────────────────

def analyse_parcel(geojson_geometry: Dict[str, Any]) -> Dict[str, Any]:
    """
    Run the full GEE vegetation analysis pipeline for a parcel.

    Parameters
    ----------
    geojson_geometry : dict
        GeoJSON Polygon geometry dict (type="Polygon", coordinates=[...]).

    Returns
    -------
    dict with keys:
        ndvi_mean, ndvi_min, ndvi_max : float
        vegetation_pixel_count        : int
        image_count                   : int
        date_range                    : {"start": str, "end": str}

    Raises
    ------
    ee.EEException
        On GEE API or authentication errors.
    RuntimeError
        If the image collection is empty (no cloud-free scenes found).
    """
    # ── Ensure GEE is authenticated ──────────────────────────────────────
    initialise_gee()

    # ── Build GEE geometry from GeoJSON ──────────────────────────────────
    geometry = ee.Geometry(geojson_geometry)

    # ── Date range: last 12 months ────────────────────────────────────────
    start_date, end_date = _build_date_range(months_back=12)

    # ── Load Sentinel-2 collection ────────────────────────────────────────
    collection  = _load_sentinel2_collection(geometry, start_date, end_date)
    image_count = collection.size().getInfo()
    logger.info(
        "Found %d cloud-filtered S2 scenes between %s and %s",
        image_count, start_date, end_date
    )

    if image_count == 0:
        raise RuntimeError(
            f"No cloud-free Sentinel-2 scenes found for the parcel between "
            f"{start_date} and {end_date}.  Try relaxing the cloud threshold."
        )

    # ── Build a median composite (reduces remaining noise / shadows) ──────
    # Median is more robust than mean for cloud-contaminated time series.
    composite = collection.median()

    # ── NDVI statistics ───────────────────────────────────────────────────
    ndvi_stats = _reduce_ndvi_stats(composite, geometry)

    # ── Vegetation pixel count (for canopy area) ──────────────────────────
    veg_pixel_count = _count_vegetation_pixels(composite, geometry)

    logger.info(
        "NDVI stats – mean=%.4f  min=%.4f  max=%.4f  veg_pixels=%d",
        ndvi_stats["mean"], ndvi_stats["min"], ndvi_stats["max"], veg_pixel_count
    )

    return {
        "ndvi_mean":               ndvi_stats["mean"],
        "ndvi_min":                ndvi_stats["min"],
        "ndvi_max":                ndvi_stats["max"],
        "vegetation_pixel_count":  veg_pixel_count,
        "image_count":             image_count,
        "date_range":              {"start": start_date, "end": end_date},
    }
