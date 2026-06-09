"""
services/service.py
─────────────────────────────────────────────────────────────────────────────
Handles Google Earth Engine (GEE) integration. 
Performs cloud-masking and multi-temporal median compositing.
Exports Cloud Optimized GeoTIFFs (COGs) for TiTiler dynamic tile streaming.
─────────────────────────────────────────────────────────────────────────────
"""

import ee
import os
import json
import logging
import uuid
import requests
import numpy as np
from datetime import datetime, timedelta, timezone
from google.oauth2 import service_account

logger = logging.getLogger(__name__)

_IS_GEE_INITIALIZED = False

# ── COG Storage Configuration ──────────────────────────────────────────────
# Local volume path (shared Docker volume mounted at /app/cog_exports in api/worker
# and /data/cogs in the TiTiler container)
COG_EXPORT_DIR = os.environ.get("COG_EXPORT_DIR", "/app/cog_exports")

# TiTiler base URL — internal Docker service name or external host
TITILER_BASE_URL = os.environ.get("TITILER_BASE_URL", "http://titiler:8000")

# Public-facing TiTiler URL (what the browser hits)
TITILER_PUBLIC_URL = os.environ.get("TITILER_PUBLIC_URL", "http://localhost:8002")

def initialise_gee():
    global _IS_GEE_INITIALIZED
    
    # Skip if already logged in
    if _IS_GEE_INITIALIZED:
        return

    try:
        key_path = "/app/detrixai.json"
        
        if not os.path.exists(key_path):
            raise FileNotFoundError(f"CRITICAL: Cannot find {key_path} inside the container!")

        credentials = service_account.Credentials.from_service_account_file(
            key_path,
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
        
        # If GEDI tracks hit the polygon, take the mean and explicitly select and rename the GEDI composite band 'rh100' to 'b1'
        height_image = gedi.mean().select(['rh100'], ['b1'])
        
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

    # Extract NDVI composite for COG export
    ndvi_image = s2_median.select('NDVI')

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
        "ee_geom": geom,
        "ee_ndvi_image": ndvi_image
    }

# ═══════════════════════════════════════════════════════════════════════════
# COG EXPORT PIPELINE
# ═══════════════════════════════════════════════════════════════════════════

def export_ndvi_cog(gee_data: dict, geojson_geometry: dict, parcel_id: str) -> dict:
    """
    Exports the NDVI median composite from GEE as a Cloud Optimized GeoTIFF.

    Steps:
        1. Download the NDVI raster from GEE via getDownloadURL (GeoTIFF format)
        2. Convert to a COG with internal tiling (256×256) and DEFLATE compression
        3. Write to the shared cog-store volume
        4. Return the file path and TiTiler tile endpoint URL

    Args:
        gee_data: The dict returned by analyse_parcel() — must contain 'ee_ndvi_image' and 'ee_geom'
        geojson_geometry: The original GeoJSON geometry dict
        parcel_id: Unique parcel identifier for filename construction

    Returns:
        dict with 'cog_path', 'cog_filename', 'titiler_tiles_url'
    """
    try:
        import rasterio
        from rasterio.transform import from_bounds
        from rasterio.io import MemoryFile

        ndvi_image = gee_data.get("ee_ndvi_image")
        ee_geom = gee_data.get("ee_geom")

        if ndvi_image is None or ee_geom is None:
            logger.warning("⚠ COG export skipped — no NDVI image or geometry available")
            return {}

        # ── Step 1: Download NDVI raster from GEE ────────────────────────────
        logger.info(f"📡 Downloading NDVI raster from GEE for parcel {parcel_id}...")

        download_url = ndvi_image.getDownloadURL({
            'name': 'ndvi_export',
            'bands': ['NDVI'],
            'region': ee_geom,
            'scale': 10,
            'format': 'GEO_TIFF',
            'crs': 'EPSG:4326'
        })

        response = requests.get(download_url, timeout=120)
        response.raise_for_status()
        raw_tiff_bytes = response.content

        logger.info(f"✅ Downloaded {len(raw_tiff_bytes)} bytes of NDVI raster data")

        # ── Step 2: Read the raw GeoTIFF and rewrite as COG ──────────────────
        os.makedirs(COG_EXPORT_DIR, exist_ok=True)

        cog_filename = f"ndvi_{parcel_id}_{uuid.uuid4().hex[:8]}.tif"
        cog_path = os.path.join(COG_EXPORT_DIR, cog_filename)

        # Read the downloaded GeoTIFF into memory
        with MemoryFile(raw_tiff_bytes) as memfile:
            with memfile.open() as src:
                data = src.read()
                profile = src.profile.copy()

                # Replace NaN / nodata with a sentinel value for clean rendering
                nodata_val = src.nodata if src.nodata is not None else -9999.0
                if np.issubdtype(data.dtype, np.floating):
                    data = np.where(np.isnan(data), nodata_val, data)

                # Update profile for COG compliance
                profile.update(
                    driver='GTiff',
                    dtype=data.dtype,
                    compress='deflate',
                    tiled=True,
                    blockxsize=256,
                    blockysize=256,
                    nodata=nodata_val,
                    interleave='band'
                )

                # Write the COG with overviews for multi-scale tile serving
                with rasterio.open(cog_path, 'w', **profile) as dst:
                    dst.write(data)

                    # Build internal overviews (pyramid levels) for fast tile access
                    overview_levels = [2, 4, 8, 16]
                    dst.build_overviews(overview_levels, rasterio.enums.Resampling.nearest)
                    dst.update_tags(ns='rio_overview', resampling='nearest')

        logger.info(f"✅ COG exported: {cog_path}")

        # ── Step 3: Construct TiTiler tile URL ───────────────────────────────
        titiler_cog_url = f"file:///data/cogs/{cog_filename}"

        titiler_tiles_url = (
            f"{TITILER_PUBLIC_URL}/cog/tiles/{{z}}/{{x}}/{{y}}"
            f"?url={titiler_cog_url}"
            f"&rescale=-1,1"
            f"&colormap_name=rdylgn"
        )

        return {
            "cog_path": cog_path,
            "cog_filename": cog_filename,
            "titiler_tiles_url": titiler_tiles_url,
            "titiler_cog_url": titiler_cog_url
        }

    except ImportError:
        logger.warning("⚠ rasterio not installed — COG export disabled. pip install rasterio")
        return {}
    except Exception as e:
        logger.error(f"❌ COG export failed for parcel {parcel_id}: {e}", exc_info=True)
        return {}


def build_titiler_tile_url(cog_filename: str, rescale: str = "-1,1",
                           colormap: str = "rdylgn") -> str:
    """
    Utility to construct a TiTiler XYZ tile URL template from a COG filename.

    Args:
        cog_filename: The .tif filename stored in the cog-store volume
        rescale: Min,max rescale range (e.g. "-1,1" for NDVI)
        colormap: Named colormap (rdylgn, viridis, ndvi, etc.)

    Returns:
        XYZ tile URL template string with {z}/{x}/{y} placeholders
    """
    titiler_cog_url = f"file:///data/cogs/{cog_filename}"
    return (
        f"{TITILER_PUBLIC_URL}/cog/tiles/{{z}}/{{x}}/{{y}}"
        f"?url={titiler_cog_url}"
        f"&rescale={rescale}"
        f"&colormap_name={colormap}"
    )
