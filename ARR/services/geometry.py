from shapely.geometry import Polygon
from shapely.validation import make_valid
import pyproj
from shapely.ops import transform

def process_dynamic_polygon(coords: list[list[float]]) -> tuple[str, float]:
    """
    Cleans GPS/Drawn arrays, ensures valid geometry, and calculates metric area.
    Expects coords as: [[lon, lat], [lon, lat], ...]
    """
    if len(coords) < 3:
        raise ValueError("Polygon must have at least 3 points.")
        
    # Close the loop if needed
    if coords[0] != coords[-1]:
        coords.append(coords[0])
        
    raw_poly = Polygon(coords)
    valid_poly = make_valid(raw_poly)
    
    if valid_poly.geom_type != 'Polygon':
         raise ValueError("Invalid shape: Self-intersecting lines detected.")
         
    # WGS84 (GPS) to an Equal-Area projection (EPSG:6933) for accurate measurement
    project = pyproj.Transformer.from_crs("epsg:4326", "epsg:6933", always_xy=True).transform
    projected_poly = transform(project, valid_poly)
    
    area_sq_meters = projected_poly.area
    area_hectares = area_sq_meters / 10000.0
    
    # Return Well-Known Text (WKT) for PostGIS insertion and the area
    return valid_poly.wkt, round(area_hectares, 4)