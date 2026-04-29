"""
services/validation.py
─────────────────────────────────────────────────────────────────────────────
Geometry cleaning and validation to ensure the AI engine processes 
valid spatial data and high-precision area calculations.
─────────────────────────────────────────────────────────────────────────────
"""

import pyproj
from shapely.geometry import shape, Polygon
from shapely.validation import make_valid
from shapely.ops import transform

def validate_and_clean_geometry(geojson_geom: dict):
    """
    Validates a GeoJSON geometry, fixes self-intersections, 
    and returns a cleaned shapely object.
    """
    try:
        geom = shape(geojson_geom)
        if not geom.is_valid:
            geom = make_valid(geom)
        
        if geom.is_empty or not isinstance(geom, Polygon):
            return None, 0.0
            
        # Calculate area using EPSG:6933 (Equal Area Projection) for high precision
        project = pyproj.Transformer.from_crs("epsg:4326", "epsg:6933", always_xy=True).transform
        projected_poly = transform(project, geom)
        area_ha = projected_poly.area / 10000.0
        
        return geom, round(area_ha, 4)
    except Exception as e:
        print(f"Geometry Validation Error: {e}")
        return None, 0.0