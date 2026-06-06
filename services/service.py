"""
services/service.py
─────────────────────────────────────────────────────────────────────────────
Handles Google Earth Engine (GEE) integration. 
Performs cloud-masking and multi-temporal median compositing.
─────────────────────────────────────────────────────────────────────────────
"""

import ee
import os
import json
import logging
from datetime import datetime, timedelta, timezone
from google.oauth2 import service_account

logger = logging.getLogger(__name__)

_IS_GEE_INITIALIZED = False

def initialise_gee():
    global _IS_GEE_INITIALIZED
    
    # Skip if already logged in
    if _IS_GEE_INITIALIZED:
        return

    try:
        # 🟢 THE FIX 2: Matching variable names
        key_path = "/app/detrixai.json"
        
        if not os.path.exists(key_path):
            raise FileNotFoundError(f"CRITICAL: Cannot find {key_path} inside the container!")

        credentials = service_account.Credentials.from_service_account_file(
            key_path, # Matches the variable above perfectly
            scopes=['https://www.googleapis.com/auth/earthengine'] 
        )

        ee.Initialize(credentials)
        
        _IS_GEE_INITIALIZED = True # Mark as successful
        logger.info("✅ GEE Authentication Successful!")
        
    except Exception as e:
        logger.error(f"❌ CRITICAL: GEE Authentication Failed: {e}")
        raise

def mask_clouds(image):
    qa = image.select('QA60')
    cloud_bit = 1 << 10
    cirrus_bit = 1 << 11
    mask = qa.bitwiseAnd(cloud_bit).eq(0).And(qa.bitwiseAnd(cirrus_bit).eq(0))
    return image.updateMask(mask).divide(10000)

def get_historical_ndvi(geometry, year):
    """Retrieves median NDVI for a specific year to prove additionality."""
    start = f"{year}-01-01"
    end = f"{year}-12-31"
    
    ee_geom = ee.Geometry.Polygon(geometry["coordinates"])
    col = (ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
           .filterBounds(ee_geom)
           .filterDate(start, end)
           .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20))
           .map(mask_clouds))
    
    if col.size().getInfo() == 0:
        return 0.0
        
    ndvi = col.map(lambda img: img.normalizedDifference(['B8', 'B4'])).median()
    stats = ndvi.reduceRegion(reducer=ee.Reducer.median(), geometry=geometry, scale=10)
    return stats.getInfo().get('nd', 0.0)

def get_canopy_height(ee_geom):
    """
    Pulls NASA GEDI rh100 (relative height 100%) or falls back to ETH fused canopy height.
    """
    try:
        # Attempt direct GEDI monthly query
        gedi = ee.ImageCollection("LARSE/GEDI/GEDI02_A_002_MONTHLY") \
                 .filterBounds(ee_geom) \
                 .select('rh100')
        
        # If GEDI tracks hit the polygon, take the mean
        height_image = gedi.mean()
        
        # Fallback to ETH Global Canopy Height (fused Sentinel/GEDI) for gap-filling
        fallback = ee.Image('users/nlang/ETH_GlobalCanopyHeight_2020_10m_v1')
        
        final_height = ee.ImageCollection([fallback, height_image]).mosaic()
        
        stats = final_height.reduceRegion(
            reducer=ee.Reducer.mean(),
            geometry=ee_geom,
            scale=10,
            maxPixels=1e9
        )
        return stats.getInfo().get('b1', 15.0) # Default 15m if completely bare
    except Exception as e:
        logger.error(f"GEDI extraction failed: {e}")
        return 15.0 

def analyse_parcel(geojson_geometry):
    initialise_gee()
    geom = ee.Geometry.Polygon(geojson_geometry["coordinates"])
    
    # Analysis Window: Last 6 months for current state
    end_date = datetime.now(timezone.utc)
    start_date = end_date - timedelta(days=180)

    # Sentinel-2 Optical
    s2_col = (ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
              .filterBounds(geom)
              .filterDate(start_date.strftime("%Y-%m-%d"), end_date.strftime("%Y-%m-%d"))
              .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20))
              .map(mask_clouds))
    
    s2_median = s2_col.map(lambda img: img.addBands(img.normalizedDifference(['B8', 'B4']).rename('NDVI'))).median()
    
    # Sentinel-1 Radar (SAR)
    s1_col = (ee.ImageCollection("COPERNICUS/S1_GRD")
              .filterBounds(geom)
              .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VV'))
              .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VH')))
    s1_median = s1_col.select(['VV', 'VH']).median()

    stats = s2_median.select('NDVI').addBands(s1_median).reduceRegion(
        reducer=ee.Reducer.mean()\
            .combine(ee.Reducer.stdDev(), sharedInputs=True)\
            .combine(ee.Reducer.min(), sharedInputs=True)\
            .combine(ee.Reducer.max(), sharedInputs=True)\
            .combine(ee.Reducer.count(), sharedInputs=True),
        geometry=geom, scale=10
    ).getInfo()

    canopy_height = get_canopy_height(geom)

    return {
        "ndvi_mean": stats.get('NDVI_mean', 0.0),
        "ndvi_min": stats.get('NDVI_min', 0.0),
        "ndvi_max": stats.get('NDVI_max', 0.0),
        "ndvi_std": stats.get('NDVI_stdDev', 0.0),
        "sar_vv_backscatter": stats.get('VV_mean', -25.0),
        "sar_vh_backscatter": stats.get('VH_mean', -25.0),
        "canopy_height": canopy_height,
        "veg_pixels": int(stats.get('NDVI_count', 0) or 0),
        "opt_imgs": s2_col.size().getInfo(),
        "rad_imgs": s1_col.size().getInfo(),
        "ee_geom": geom
    }
