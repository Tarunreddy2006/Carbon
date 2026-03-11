from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from typing import Any, Dict, Tuple

import ee

logger = logging.getLogger(__name__)

SENTINEL2_DATASET    = "COPERNICUS/S2_SR"
MAX_CLOUD_PERCENTAGE = 20
NDVI_THRESHOLD       = 0.4

BAND_RED  = "B4"
BAND_NIR  = "B8"
BAND_SCL  = "SCL"
SCALE_METRES = 10

@lru_cache(maxsize=1)
def initialise_gee() -> None:
    project_id           = os.getenv("GEE_PROJECT_ID", "")
    use_service_account  = os.getenv("GEE_USE_SERVICE_ACCOUNT", "false").lower() == "true"
    service_account      = os.getenv("GEE_SERVICE_ACCOUNT", "")
    key_file             = os.getenv("GEE_KEY_FILE", "")

    if use_service_account and service_account and key_file:
        credentials = ee.ServiceAccountCredentials(service_account, key_file)
        ee.Initialize(credentials=credentials, project=project_id)
    else:
        ee.Initialize(project=project_id or None)
    logger.info("Google Earth Engine initialised (project=%s)", project_id or "default")

def _build_date_range(months_back: int = 12) -> Tuple[str, str]:
    # FIXED: Replaced deprecated datetime.utcnow() with modern timezone-aware UTC
    end_dt   = datetime.now(timezone.utc)
    start_dt = end_dt - timedelta(days=months_back * 30)
    return start_dt.strftime("%Y-%m-%d"), end_dt.strftime("%Y-%m-%d")

def _mask_clouds_s2(image: ee.Image) -> ee.Image:
    scl = image.select(BAND_SCL)
    clear = scl.neq(3).And(scl.neq(8)).And(scl.neq(9)).And(scl.neq(10))
    return image.updateMask(clear)

def _compute_ndvi(image: ee.Image) -> ee.Image:
    red  = image.select(BAND_RED).divide(10_000)
    nir  = image.select(BAND_NIR).divide(10_000)
    ndvi = nir.subtract(red).divide(nir.add(red)).rename("NDVI")
    return image.addBands(ndvi)

def _load_sentinel2_collection(geometry: ee.Geometry, start_date: str, end_date: str) -> ee.ImageCollection:
    return (
        ee.ImageCollection(SENTINEL2_DATASET)
        .filterDate(start_date, end_date)
        .filterBounds(geometry)
        .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", MAX_CLOUD_PERCENTAGE))
        .map(_mask_clouds_s2)
        .map(_compute_ndvi)
    )

def _reduce_ndvi_stats(ndvi_image: ee.Image, geometry: ee.Geometry, scale: int = SCALE_METRES) -> Dict[str, float]:
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

def _count_vegetation_pixels(ndvi_image: ee.Image, geometry: ee.Geometry, threshold: float = NDVI_THRESHOLD, scale: int = SCALE_METRES) -> int:
    veg_mask  = ndvi_image.select("NDVI").gt(threshold).rename("veg")
    pixel_sum = veg_mask.reduceRegion(
        reducer  = ee.Reducer.sum(),
        geometry = geometry,
        scale    = scale,
        maxPixels= 1e9,
    ).getInfo()
    return int(pixel_sum.get("veg", 0) or 0)

def analyse_parcel(geojson_geometry: Dict[str, Any]) -> Dict[str, Any]:
    initialise_gee()
    geometry = ee.Geometry(geojson_geometry)
    start_date, end_date = _build_date_range(months_back=12)
    collection  = _load_sentinel2_collection(geometry, start_date, end_date)
    image_count = collection.size().getInfo()
    
    if image_count == 0:
        raise RuntimeError(f"No cloud-free Sentinel-2 scenes found between {start_date} and {end_date}.")

    composite = collection.median()
    ndvi_stats = _reduce_ndvi_stats(composite, geometry)
    veg_pixel_count = _count_vegetation_pixels(composite, geometry)

    return {
        "ndvi_mean":               ndvi_stats["mean"],
        "ndvi_min":                ndvi_stats["min"],
        "ndvi_max":                ndvi_stats["max"],
        "vegetation_pixel_count":  veg_pixel_count,
        "image_count":             image_count,
        "date_range":              {"start": start_date, "end": end_date},
    }