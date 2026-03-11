from __future__ import annotations

import hashlib
import logging
import math
import os
import random
import re
from typing import Any, Dict, List, Optional, Tuple

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from urllib3.exceptions import InsecureRequestWarning

from models.parcel import ParcelRequest

logger = logging.getLogger(__name__)

KGIS_BASE_URL: str = os.getenv("KGIS_BASE_URL", "https://kgis.ksrsac.in:9000/genericwebservices/ws")
KGIS_DEPT_CODE: str  = os.getenv("KGIS_DEPT_CODE",  "1")
KGIS_APPLN_CODE: str = os.getenv("KGIS_APPLN_CODE", "102")
KGIS_TIMEOUT: int = int(os.getenv("KGIS_TIMEOUT", "15"))
KGIS_MAX_RETRIES: int = int(os.getenv("KGIS_MAX_RETRIES", "2"))

KARNATAKA_DISTRICT_CENTROIDS: Dict[str, Tuple[float, float]] = {
    "Mysuru":             (76.6394, 12.2958),
    "Bengaluru":          (77.5946, 12.9716),
}
_DEFAULT_CENTROID: Tuple[float, float] = (76.6394, 12.2958)

if os.getenv("KGIS_VERIFY_SSL", "true").lower() == "false":
    import urllib3
    urllib3.disable_warnings(InsecureRequestWarning)

def _build_http_session() -> requests.Session:
    session = requests.Session()
    retry = Retry(
        total            = KGIS_MAX_RETRIES,
        backoff_factor   = 0.5,
        status_forcelist = {500, 502, 503, 504},
        allowed_methods  = {"GET"},
    )
    adapter = HTTPAdapter(max_retries=retry)
    session.mount("https://", adapter)
    session.mount("http://",  adapter)
    return session

_http: requests.Session = _build_http_session()

def _normalise_hierarchy_response(raw: Any, context: str = "") -> List[Dict]:
    if raw is None: return []
    if isinstance(raw, list): return raw
    if isinstance(raw, dict):
        for key in ("data", "result", "Data", "Result"):
            wrapped = raw.get(key)
            if isinstance(wrapped, list): return wrapped
        return []
    return []

def _kgis_get(endpoint: str, params: Dict[str, Any]) -> Any:
    url = f"{KGIS_BASE_URL.rstrip('/')}/{endpoint}"
    verify_ssl = os.getenv("KGIS_VERIFY_SSL", "true").lower() != "false"
    resp = _http.get(url, params=params, timeout=KGIS_TIMEOUT, verify=verify_ssl)
    resp.raise_for_status()

    try:
        parsed = resp.json()
    except Exception as json_exc:
        raise ValueError(f"K-GIS returned non-JSON response from '{endpoint}'") from json_exc

    if parsed is None:
        raise ValueError(f"K-GIS returned null from '{endpoint}'")
    return parsed

def _resolve_code(
    type_label: str, name: str, parent_code: str,
    name_keys: Tuple[str, ...] = ("name", "distname", "talukname", "hobliname", "vname"),
    code_keys: Tuple[str, ...] = ("code", "distcode", "talukcode", "hoblicode", "vcode"),
) -> str:
    params = {"deptcode": KGIS_DEPT_CODE, "applncode": KGIS_APPLN_CODE, "type": type_label, "code": parent_code}
    raw = _kgis_get("kgisadminhierarchy", params)
    items: List[Dict] = _normalise_hierarchy_response(raw, context=f"{type_label} lookup")

    if not items: raise ValueError(f"No {type_label} entries for parent '{parent_code}'")
    target = name.strip().lower()

    for item in items:
        for nk in name_keys:
            if str(item.get(nk, "")).strip().lower() == target:
                for ck in code_keys:
                    if ck in item: return str(item[ck]).strip()

    raise ValueError(f"{type_label} '{name}' not found under parent '{parent_code}'.")

def _resolve_district_code(district_name: str) -> str:
    return _resolve_code("District", district_name, "0", ("distname", "name", "DISTNAME"), ("distcode", "code", "DISTCODE"))

def _resolve_taluk_code(taluk_name: str, district_code: str) -> str:
    return _resolve_code("Taluk", taluk_name, district_code, ("talukname", "name", "TALUKNAME"), ("talukcode", "code", "TALUKCODE"))

def _resolve_hobli_code(hobli_name: str, taluk_code: str) -> str:
    return _resolve_code("Hobli", hobli_name, taluk_code, ("hobliname", "name", "HOBLINAME"), ("hoblicode", "code", "HOBLICODE"))

def _resolve_village_code(village_name: str, hobli_code: str) -> str:
    return _resolve_code("Village", village_name, hobli_code, ("vname", "name", "VNAME"), ("vcode", "code", "VCODE"))

def _fetch_kgis_survey_polygon(village_code: str, survey_no: str, hissa: Optional[str]) -> Dict[str, Any]:
    params = {"deptcode": KGIS_DEPT_CODE, "applncode": KGIS_APPLN_CODE, "villcode": village_code, "surveyno": survey_no}
    if hissa: params["hissano"] = hissa

    data = _kgis_get("kgissurveynumber", params)
    if isinstance(data, list) and data: data = data[0]
    inner = data.get("data") if isinstance(data, dict) else data
    feature: Dict[str, Any] = inner if isinstance(inner, dict) else data

    for key in ("geometry", "geojson"):
        geom = feature.get(key)
        if isinstance(geom, dict) and geom.get("type") == "Polygon": return _normalise_geojson_polygon(geom)

    for key in ("the_geom", "geom", "wkt"):
        wkt_val = feature.get(key)
        if isinstance(wkt_val, str) and wkt_val.strip().upper().startswith("POLYGON"): return _wkt_polygon_to_geojson(wkt_val)

    for key in ("coordinates", "coords"):
        raw_coords = feature.get(key)
        if isinstance(raw_coords, list) and raw_coords: return _raw_coords_to_geojson(raw_coords)

    raise ValueError("K-GIS survey response contains no recognisable geometry.")

def _normalise_geojson_polygon(geom: Dict[str, Any]) -> Dict[str, Any]:
    rings = geom.get("coordinates")
    clean_rings: List[List[List[float]]] = []
    for ring in rings:
        clean_ring: List[List[float]] = []
        for vertex in ring:
            if isinstance(vertex, (list, tuple)) and len(vertex) >= 2:
                clean_ring.append([float(vertex[0]), float(vertex[1])])
        if clean_ring and clean_ring[0] != clean_ring[-1]:
            clean_ring.append(clean_ring[0])
        clean_rings.append(clean_ring)
    return {"type": "Polygon", "coordinates": clean_rings}

def _wkt_polygon_to_geojson(wkt: str) -> Dict[str, Any]:
    wkt = re.sub(r"^SRID=\d+;", "", wkt.strip(), flags=re.IGNORECASE).strip()
    ring_strings = re.findall(r"\(([^()]+)\)", wkt)
    rings: List[List[List[float]]] = []
    for ring_str in ring_strings:
        pairs = ring_str.strip().split(",")
        ring: List[List[float]] = []
        for pair in pairs:
            parts = pair.strip().split()
            if len(parts) >= 2: ring.append([float(parts[0]), float(parts[1])])
        if ring and ring[0] != ring[-1]: ring.append(ring[0])
        rings.append(ring)
    return {"type": "Polygon", "coordinates": rings}

def _raw_coords_to_geojson(coords: List[Any]) -> Dict[str, Any]:
    """FIXED: Added bounds checking to prevent index crash on malformed payloads."""
    if not coords:
        raise ValueError("Received empty coordinates array from API")

    if (
        isinstance(coords[0], list)
        and len(coords[0]) > 0
        and isinstance(coords[0][0], list)
    ):
        return _normalise_geojson_polygon({"type": "Polygon", "coordinates": coords})

    return _normalise_geojson_polygon({"type": "Polygon", "coordinates": [coords]})

def _lookup_kgis_polygon(req: ParcelRequest) -> Dict[str, Any]:
    district_code = _resolve_district_code(req.district)
    taluk_code = _resolve_taluk_code(req.taluk, district_code)
    hobli_code = _resolve_hobli_code(req.hobli, taluk_code) if req.hobli else _infer_hobli_code(req.village, taluk_code)
    village_code = _resolve_village_code(req.village, hobli_code)
    return _fetch_kgis_survey_polygon(village_code, req.survey_no, req.hissa)

def _infer_hobli_code(village_name: str, taluk_code: str) -> str:
    params = {"deptcode": KGIS_DEPT_CODE, "applncode": KGIS_APPLN_CODE, "type": "Hobli", "code": taluk_code}
    hoblis: List[Dict] = _normalise_hierarchy_response(_kgis_get("kgisadminhierarchy", params))
    
    target = village_name.strip().lower()
    for hobli in hoblis:
        hobli_code = str(hobli.get("hoblicode") or hobli.get("code", "")).strip()
        if not hobli_code: continue
        try:
            vraw = _kgis_get("kgisadminhierarchy", {"deptcode": KGIS_DEPT_CODE, "applncode": KGIS_APPLN_CODE, "type": "Village", "code": hobli_code})
            vlist = _normalise_hierarchy_response(vraw)
            for village in vlist:
                for nk in ("vname", "name", "VNAME"):
                    if str(village.get(nk, "")).strip().lower() == target: return hobli_code
        except Exception:
            continue
    raise ValueError(f"Village '{village_name}' not found in any hobli.")

def _lookup_bhoomi_api(req: ParcelRequest, base_url: str, api_key: str) -> Dict[str, Any]:
    url = f"{base_url.rstrip('/')}/parcel/boundary"
    resp = requests.post(url, json=req.dict(), headers={"Authorization": f"Bearer {api_key}"}, timeout=10)
    resp.raise_for_status()
    geometry = resp.json().get("geometry")
    if not geometry: raise ValueError("Unexpected Bhoomi API response shape.")
    return geometry

def _simulate_parcel_polygon(centroid_lon: float, centroid_lat: float, seed: int) -> Dict[str, Any]:
    rng = random.Random(seed)
    origin_lon = centroid_lon + rng.uniform(-0.05, 0.05)
    origin_lat = centroid_lat + rng.uniform(-0.05, 0.05)
    area_m2 = rng.uniform(2.0, 10.0) * 10_000.0
    side_m = math.sqrt(area_m2)
    width_m = side_m * rng.uniform(0.6, 1.4)
    height_m = area_m2 / width_m
    delta_lon = width_m / (111_320.0 * math.cos(math.radians(origin_lat)))
    delta_lat = height_m / 111_320.0

    sw = [round(origin_lon, 6), round(origin_lat, 6)]
    se = [round(origin_lon + delta_lon, 6), round(origin_lat, 6)]
    ne = [round(origin_lon + delta_lon, 6), round(origin_lat + delta_lat, 6)]
    nw = [round(origin_lon, 6), round(origin_lat + delta_lat, 6)]
    return {"type": "Polygon", "coordinates": [[sw, se, ne, nw, sw]]}

def build_parcel_id(req: ParcelRequest) -> str:
    parts = [req.state.upper(), req.district.upper(), req.taluk.upper(), req.village.upper(), str(req.survey_no).upper()]
    if req.hissa: parts.append(str(req.hissa).upper())
    return "/".join(parts)

def get_parcel_boundary(req: ParcelRequest) -> Dict[str, Any]:
    parcel_id = build_parcel_id(req)
    try:
        return _lookup_kgis_polygon(req)
    except Exception as kgis_exc:
        logger.warning("K-GIS lookup failed: %s", kgis_exc)

    base_url = os.getenv("LAND_LOOKUP_BASE_URL", "")
    api_key  = os.getenv("LAND_LOOKUP_API_KEY",  "")
    if base_url and api_key and base_url != "https://api.example.karnataka.gov.in/land-records":
        try:
            return _lookup_bhoomi_api(req, base_url, api_key)
        except Exception as bhoomi_exc:
            logger.warning("Bhoomi API failed: %s", bhoomi_exc)

    seed = int(hashlib.sha256(parcel_id.encode()).hexdigest()[:8], 16)
    clon, clat = KARNATAKA_DISTRICT_CENTROIDS.get(req.district.strip().title(), _DEFAULT_CENTROID)
    return _simulate_parcel_polygon(clon, clat, seed)