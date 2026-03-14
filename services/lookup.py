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

KGIS_BASE_URL: str   = os.getenv("KGIS_BASE_URL",   "https://kgis.ksrsac.in:9000/genericwebservices/ws")
KGIS_DEPT_CODE: str  = os.getenv("KGIS_DEPT_CODE",  "1")
KGIS_APPLN_CODE: str = os.getenv("KGIS_APPLN_CODE", "102")
KGIS_TIMEOUT: int    = int(os.getenv("KGIS_TIMEOUT",    "15"))
KGIS_MAX_RETRIES: int = int(os.getenv("KGIS_MAX_RETRIES", "2"))

KARNATAKA_DISTRICT_CENTROIDS: Dict[str, Tuple[float, float]] = {
    # All 31 Karnataka districts — canonical spelling as key
    "Bagalkote":           (75.6961, 16.1826),
    "Ballari":             (76.9214, 15.1394),
    "Belagavi":            (74.4977, 15.8497),
    "Bengaluru Rural":     (77.5178, 13.1007),
    "Bengaluru Urban":     (77.5946, 12.9716),
    "Bengaluru":           (77.5946, 12.9716),
    "Bidar":               (77.5199, 17.9133),
    "Chamarajanagar":      (77.0000, 11.9230),
    "Chikkaballapur":      (77.7310, 13.4355),
    "Chikkamagaluru":      (75.7720, 13.3161),
    "Chitradurga":         (76.3998, 14.2251),
    "Dakshina Kannada":    (75.0000, 12.8438),
    "Davanagere":          (75.9238, 14.4663),
    "Dharwad":             (75.0078, 15.4589),
    "Gadag":               (75.6167, 15.4167),
    "Hassan":              (76.1000, 13.0033),
    "Haveri":              (75.4000, 14.7939),
    "Kalaburagi":          (76.8240, 17.3297),
    "Kodagu":              (75.7480, 12.4244),
    "Kolar":               (78.1294, 13.1360),
    "Koppal":              (76.1547, 15.3500),
    "Mandya":              (76.8950, 12.5218),
    "Mysuru":              (76.6394, 12.2958),
    "Raichur":             (77.3566, 16.2120),
    "Ramanagara":          (77.2780, 12.7157),
    "Shivamogga":          (75.5681, 13.9299),
    "Tumakuru":            (77.1010, 13.3379),
    "Udupi":               (74.7421, 13.3409),
    "Uttara Kannada":      (74.7902, 14.7937),
    "Vijayapura":          (75.7195, 16.8302),
    "Yadgir":              (77.1383, 16.7670),
    # Common alternate spellings / bracket variants
    "Bangalore":           (77.5946, 12.9716),
    "Bangalore Rural":     (77.5178, 13.1007),
    "Bangalore Urban":     (77.5946, 12.9716),
    "Bangalore(Rural)":    (77.5178, 13.1007),
    "Bangalore(Urban)":    (77.5946, 12.9716),
    "Bengaluru(Rural)":    (77.5178, 13.1007),
    "Bengaluru(Urban)":    (77.5946, 12.9716),
    "Chikkaballapura":     (77.7310, 13.4355),
    "Shimoga":             (75.5681, 13.9299),
    "Gulbarga":            (76.8240, 17.3297),
    "Belgaum":             (74.4977, 15.8497),
    "Bijapur":             (75.7195, 16.8302),
    "Bellary":             (76.9214, 15.1394),
    "Tumkur":              (77.1010, 13.3379),
    "Mysore":              (76.6394, 12.2958),
    "South Canara":        (75.0000, 12.8438),
    "North Canara":        (74.7902, 14.7937),
}
_DEFAULT_CENTROID: Tuple[float, float] = (77.5946, 12.9716)  # Bengaluru Urban


def _get_district_centroid(district: str) -> Tuple[float, float]:
    """
    Return (lon, lat) centroid for a Karnataka district.

    Matching strategy (most-to-least specific):
      1. Exact match after stripping whitespace
      2. Case-insensitive exact match
      3. Input contains a known district name (handles "Bengaluru(Rural)" → "Bengaluru Rural")
      4. Known district name contains the input (handles abbreviations)
      5. Default centroid (Bengaluru Urban)
    """
    if not district:
        return _DEFAULT_CENTROID

    d = district.strip()

    # 1. Exact match
    if d in KARNATAKA_DISTRICT_CENTROIDS:
        return KARNATAKA_DISTRICT_CENTROIDS[d]

    # 2. Case-insensitive exact
    d_lower = d.lower()
    for key, coords in KARNATAKA_DISTRICT_CENTROIDS.items():
        if key.lower() == d_lower:
            return coords

    # 3 & 4. Substring match — handles brackets, extra words, spelling variants
    # Strip brackets/punctuation from the input for cleaner matching
    d_clean = re.sub(r"[^a-z\s]", " ", d_lower).strip()
    best_key   = None
    best_len   = 0
    for key, coords in KARNATAKA_DISTRICT_CENTROIDS.items():
        k = re.sub(r"[^a-z\s]", " ", key.lower()).strip()
        # Score by length of the matching token to prefer longer/more-specific matches
        if k in d_clean or d_clean in k:
            if len(k) > best_len:
                best_key = key
                best_len = len(k)

    if best_key:
        logger.debug(
            "District centroid fuzzy match: '%s' → '%s'", district, best_key
        )
        return KARNATAKA_DISTRICT_CENTROIDS[best_key]

    logger.warning(
        "District centroid not found for '%s' — using Bengaluru default", district
    )
    return _DEFAULT_CENTROID

# Suppress urllib3's per-request SSL warning when KGIS_VERIFY_SSL=false.
# K-GIS port 9000 uses a self-signed certificate.  Without this suppression,
# the warning fires on every single API call and buries real log messages.
if os.getenv("KGIS_VERIFY_SSL", "true").lower() == "false":
    import urllib3
    urllib3.disable_warnings(InsecureRequestWarning)
    logger.info(
        "KGIS_VERIFY_SSL=false — InsecureRequestWarning suppressed. "
        "Only use this on trusted internal networks."
    )


# ── HTTP session ──────────────────────────────────────────────────────────────

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


# ── Response normalisation ────────────────────────────────────────────────────

def _normalise_hierarchy_response(raw: Any, context: str = "") -> List[Dict]:
    """
    Safely convert any K-GIS kgisadminhierarchy response into List[Dict].

    Handles every shape K-GIS is known to return:
      null / None           → []
      [...]                 → as-is
      {"data":   [...]}     → inner list
      {"result": [...]}     → inner list
      {}  / unknown dict    → []
      unexpected scalar     → []
    """
    if raw is None:
        logger.warning("K-GIS %s: response was null — returning []", context)
        return []
    if isinstance(raw, list):
        return raw
    if isinstance(raw, dict):
        for key in ("data", "result", "Data", "Result"):
            wrapped = raw.get(key)
            if isinstance(wrapped, list):
                return wrapped
        logger.warning(
            "K-GIS %s: dict with unrecognised keys %s — returning []",
            context, list(raw.keys())[:10],
        )
        return []
    logger.warning("K-GIS %s: unexpected type %s — returning []", context, type(raw).__name__)
    return []


# ── Core HTTP helper ──────────────────────────────────────────────────────────

def _kgis_get(endpoint: str, params: Dict[str, Any]) -> Any:
    """
    GET one K-GIS endpoint.  Never returns None — raises ValueError instead.
    Logs the raw response body on any JSON decode failure.
    """
    url = f"{KGIS_BASE_URL.rstrip('/')}/{endpoint}"
    verify_ssl = os.getenv("KGIS_VERIFY_SSL", "true").lower() != "false"

    logger.debug("K-GIS GET %s  params=%s", url, params)

    resp = _http.get(url, params=params, timeout=KGIS_TIMEOUT, verify=verify_ssl)
    resp.raise_for_status()

    try:
        parsed = resp.json()
    except Exception as exc:
        logger.error(
            "K-GIS non-JSON  endpoint=%s  status=%s  body=%r",
            endpoint, resp.status_code, resp.text[:400],
        )
        raise ValueError(
            f"K-GIS returned non-JSON from '{endpoint}' "
            f"(status {resp.status_code}): {resp.text[:200]}"
        ) from exc

    if parsed is None:
        logger.error(
            "K-GIS null response  endpoint=%s  status=%s  body=%r",
            endpoint, resp.status_code, resp.text[:400],
        )
        raise ValueError(f"K-GIS returned null from '{endpoint}'")

    return parsed


# ── Admin hierarchy resolvers ─────────────────────────────────────────────────

def _resolve_code(
    type_label: str,
    name: str,
    parent_code: str,
    name_keys: Tuple[str, ...] = ("name", "distname", "talukname", "hobliname", "vname"),
    code_keys: Tuple[str, ...] = ("code", "distcode", "talukcode", "hoblicode", "vcode"),
) -> str:
    params = {
        "deptcode":  KGIS_DEPT_CODE,
        "applncode": KGIS_APPLN_CODE,
        "type":      type_label,
        "code":      parent_code,
    }
    raw   = _kgis_get("kgisadminhierarchy", params)
    items = _normalise_hierarchy_response(raw, context=f"{type_label} lookup (parent={parent_code})")

    if not items:
        raise ValueError(f"K-GIS: no {type_label} entries for parent '{parent_code}'")

    target = name.strip().lower()
    for item in items:
        for nk in name_keys:
            if str(item.get(nk, "")).strip().lower() == target:
                for ck in code_keys:
                    if ck in item:
                        return str(item[ck]).strip()

    raise ValueError(f"K-GIS: {type_label} '{name}' not found under parent '{parent_code}'")


def _resolve_district_code(district_name: str) -> str:
    return _resolve_code(
        "District", district_name, "0",
        ("distname", "name", "DISTNAME"),
        ("distcode", "code", "DISTCODE"),
    )

def _resolve_taluk_code(taluk_name: str, district_code: str) -> str:
    return _resolve_code(
        "Taluk", taluk_name, district_code,
        ("talukname", "name", "TALUKNAME"),
        ("talukcode", "code", "TALUKCODE"),
    )

def _resolve_hobli_code(hobli_name: str, taluk_code: str) -> str:
    return _resolve_code(
        "Hobli", hobli_name, taluk_code,
        ("hobliname", "name", "HOBLINAME"),
        ("hoblicode", "code", "HOBLICODE"),
    )

def _resolve_village_code(village_name: str, hobli_code: str) -> str:
    return _resolve_code(
        "Village", village_name, hobli_code,
        ("vname", "villagename", "name", "VNAME"),
        ("vcode", "villagecode", "code", "VCODE"),
    )


# ── Survey polygon fetcher ────────────────────────────────────────────────────

def _fetch_kgis_survey_polygon(
    village_code: str,
    survey_no: str,
    hissa: Optional[str],
) -> Dict[str, Any]:
    params: Dict[str, Any] = {
        "deptcode":  KGIS_DEPT_CODE,
        "applncode": KGIS_APPLN_CODE,
        "villcode":  village_code,
        "surveyno":  survey_no,
    }
    if hissa:
        params["hissano"] = hissa

    data = _kgis_get("kgissurveynumber", params)

    # ── Unwrap list wrapper ───────────────────────────────────────────────
    # FIX: raise early on empty list — previously [] passed the guard and
    # crashed later when .get() was called on a list object.
    if isinstance(data, list):
        if not data:
            raise ValueError(
                f"K-GIS returned an empty list for village={village_code} survey={survey_no}"
            )
        data = data[0]

    # ── Validate dict before any attribute access ─────────────────────────
    if not isinstance(data, dict):
        raise ValueError(
            f"K-GIS survey response is {type(data).__name__}, expected dict "
            f"(village={village_code} survey={survey_no})"
        )

    inner = data.get("data")
    feature: Dict[str, Any] = inner if isinstance(inner, dict) else data

    # Strategy 1 — explicit GeoJSON geometry key
    for key in ("geometry", "geojson", "geo_json"):
        geom = feature.get(key)
        if isinstance(geom, dict) and geom.get("type") == "Polygon":
            return _normalise_geojson_polygon(geom)

    # Strategy 2 — WKT string
    for key in ("the_geom", "geom", "wkt", "geometry_wkt", "shape"):
        wkt_val = feature.get(key)
        if isinstance(wkt_val, str) and wkt_val.strip().upper().startswith("POLYGON"):
            return _wkt_polygon_to_geojson(wkt_val)

    # Strategy 3 — raw coordinates array
    for key in ("coordinates", "coords", "polygon_coordinates"):
        raw_coords = feature.get(key)
        if isinstance(raw_coords, list) and raw_coords:
            return _raw_coords_to_geojson(raw_coords)

    raise ValueError(
        f"K-GIS survey response has no recognisable geometry. "
        f"Keys present: {list(feature.keys())}"
    )


# ── GeoJSON normalisation ─────────────────────────────────────────────────────

def _normalise_geojson_polygon(geom: Dict[str, Any]) -> Dict[str, Any]:
    if geom.get("type") != "Polygon":
        raise ValueError(f"Expected Polygon, got '{geom.get('type')}'")

    # FIX: guard rings before iterating — previously crashed with TypeError
    # when the 'coordinates' key was missing or null.
    rings = geom.get("coordinates")
    if not rings or not isinstance(rings, list):
        raise ValueError("GeoJSON Polygon has no coordinates")

    clean_rings: List[List[List[float]]] = []
    for ring in rings:
        if not ring or not isinstance(ring, list):
            continue
        clean_ring: List[List[float]] = []
        for vertex in ring:
            if isinstance(vertex, (list, tuple)) and len(vertex) >= 2:
                clean_ring.append([float(vertex[0]), float(vertex[1])])
            elif isinstance(vertex, dict):
                lon = float(vertex.get("x") or vertex.get("lon") or vertex.get("longitude", 0))
                lat = float(vertex.get("y") or vertex.get("lat") or vertex.get("latitude",  0))
                clean_ring.append([lon, lat])
        if len(clean_ring) < 3:
            raise ValueError(f"Ring has fewer than 3 vertices: {len(clean_ring)}")
        if clean_ring[0] != clean_ring[-1]:
            clean_ring.append(clean_ring[0])
        clean_rings.append(clean_ring)

    if not clean_rings:
        raise ValueError("No valid rings found in GeoJSON Polygon")

    return {"type": "Polygon", "coordinates": clean_rings}


def _wkt_polygon_to_geojson(wkt: str) -> Dict[str, Any]:
    wkt = re.sub(r"^SRID=\d+;", "", wkt.strip(), flags=re.IGNORECASE).strip()
    ring_strings = re.findall(r"\(([^()]+)\)", wkt)
    if not ring_strings:
        raise ValueError(f"Cannot parse WKT polygon: {wkt[:120]}")

    rings: List[List[List[float]]] = []
    for ring_str in ring_strings:
        ring: List[List[float]] = []
        for pair in ring_str.strip().split(","):
            parts = pair.strip().split()
            if len(parts) >= 2:
                ring.append([float(parts[0]), float(parts[1])])
        if len(ring) < 3:
            continue
        if ring[0] != ring[-1]:
            ring.append(ring[0])
        rings.append(ring)

    if not rings:
        raise ValueError(f"WKT polygon produced no valid rings: {wkt[:120]}")

    return {"type": "Polygon", "coordinates": rings}


def _raw_coords_to_geojson(coords: List[Any]) -> Dict[str, Any]:
    if not coords:
        raise ValueError("Empty coordinates array from K-GIS API")
    if (
        isinstance(coords[0], list)
        and len(coords[0]) > 0
        and isinstance(coords[0][0], list)
    ):
        return _normalise_geojson_polygon({"type": "Polygon", "coordinates": coords})
    return _normalise_geojson_polygon({"type": "Polygon", "coordinates": [coords]})


# ── K-GIS top-level integration ───────────────────────────────────────────────

def _lookup_kgis_polygon(req: ParcelRequest) -> Dict[str, Any]:
    logger.info(
        "K-GIS: resolution chain  district=%s  taluk=%s  village=%s  survey=%s",
        req.district, req.taluk, req.village, req.survey_no,
    )
    district_code = _resolve_district_code(req.district)
    taluk_code    = _resolve_taluk_code(req.taluk, district_code)
    hobli_code    = (
        _resolve_hobli_code(req.hobli, taluk_code)
        if req.hobli
        else _infer_hobli_code(req.village, taluk_code)
    )
    village_code  = _resolve_village_code(req.village, hobli_code)
    return _fetch_kgis_survey_polygon(village_code, req.survey_no, req.hissa)


def _infer_hobli_code(village_name: str, taluk_code: str) -> str:
    logger.warning(
        "hobli not provided — scanning all hoblis in taluk %s for village '%s'. "
        "Supply 'hobli' in the request to avoid this performance penalty.",
        taluk_code, village_name,
    )
    params = {
        "deptcode":  KGIS_DEPT_CODE,
        "applncode": KGIS_APPLN_CODE,
        "type":      "Hobli",
        "code":      taluk_code,
    }
    hoblis = _normalise_hierarchy_response(
        _kgis_get("kgisadminhierarchy", params),
        context=f"Hobli scan (taluk={taluk_code})",
    )
    if not hoblis:
        raise ValueError(f"K-GIS: no hoblis for taluk '{taluk_code}'")

    target = village_name.strip().lower()
    for hobli in hoblis:
        hobli_code = str(hobli.get("hoblicode") or hobli.get("code", "")).strip()
        if not hobli_code:
            continue
        try:
            vlist = _normalise_hierarchy_response(
                _kgis_get("kgisadminhierarchy", {
                    "deptcode":  KGIS_DEPT_CODE,
                    "applncode": KGIS_APPLN_CODE,
                    "type":      "Village",
                    "code":      hobli_code,
                }),
                context=f"Village scan (hobli={hobli_code})",
            )
            for village in vlist:
                for nk in ("vname", "villagename", "name", "VNAME"):
                    if str(village.get(nk, "")).strip().lower() == target:
                        return hobli_code
        except Exception:
            continue

    raise ValueError(f"K-GIS: village '{village_name}' not found in any hobli under taluk '{taluk_code}'")


# ── Legacy Bhoomi stub ────────────────────────────────────────────────────────

def _lookup_bhoomi_api(req: ParcelRequest, base_url: str, api_key: str) -> Dict[str, Any]:
    url  = f"{base_url.rstrip('/')}/parcel/boundary"
    resp = requests.post(
        url,
        json    = req.dict(),
        headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        timeout = 10,
    )
    resp.raise_for_status()

    # FIX: was `resp.json().get("geometry")` — crashes if response is null or
    # non-JSON.  Now validates the parsed value before any attribute access.
    try:
        data = resp.json()
    except Exception as exc:
        logger.error("Bhoomi non-JSON  status=%s  body=%r", resp.status_code, resp.text[:400])
        raise ValueError(f"Bhoomi returned non-JSON (status {resp.status_code})") from exc

    if not isinstance(data, dict):
        raise ValueError(
            f"Bhoomi response is not a JSON object (got {type(data).__name__}): "
            f"{resp.text[:200]!r}"
        )

    geometry = data.get("geometry") or data.get("parcel_geometry")
    if not geometry:
        raise ValueError(f"Unexpected Bhoomi response shape: {list(data.keys())}")
    return geometry


# ── Simulation fallback ───────────────────────────────────────────────────────

def _simulate_parcel_polygon(
    centroid_lon: float,
    centroid_lat: float,
    seed: int,
) -> Dict[str, Any]:
    rng        = random.Random(seed)
    origin_lon = centroid_lon + rng.uniform(-0.05, 0.05)
    origin_lat = centroid_lat + rng.uniform(-0.05, 0.05)
    area_m2    = rng.uniform(2.0, 10.0) * 10_000.0
    side_m     = math.sqrt(area_m2)
    width_m    = side_m * rng.uniform(0.6, 1.4)
    height_m   = area_m2 / width_m
    delta_lon  = width_m  / (111_320.0 * math.cos(math.radians(origin_lat)))
    delta_lat  = height_m / 111_320.0

    sw = [round(origin_lon,             6), round(origin_lat,             6)]
    se = [round(origin_lon + delta_lon, 6), round(origin_lat,             6)]
    ne = [round(origin_lon + delta_lon, 6), round(origin_lat + delta_lat, 6)]
    nw = [round(origin_lon,             6), round(origin_lat + delta_lat, 6)]
    return {"type": "Polygon", "coordinates": [[sw, se, ne, nw, sw]]}


# ── Public interface ──────────────────────────────────────────────────────────

def build_parcel_id(req: ParcelRequest) -> str:
    parts = [
        req.state.upper(),
        req.district.upper(),
        req.taluk.upper(),
        req.village.upper(),
        str(req.survey_no).upper(),
    ]
    if req.hissa:
        parts.append(str(req.hissa).upper())
    return "/".join(parts)


def get_parcel_boundary(req: ParcelRequest) -> Dict[str, Any]:
    """
    Return a GeoJSON Polygon for the parcel.  Resolution cascade:
      1. K-GIS Web API (KSRSAC)
      2. Bhoomi / DILRMP (optional, only if LAND_LOOKUP_BASE_URL is configured)
      3. Deterministic simulation (guaranteed fallback — never raises)

    Blocking — always call via run_in_threadpool from async routes.
    """
    parcel_id = build_parcel_id(req)
    logger.info("Parcel boundary requested: %s", parcel_id)

    # 1. K-GIS
    try:
        polygon = _lookup_kgis_polygon(req)
        logger.info("K-GIS lookup succeeded for '%s'", parcel_id)
        return polygon
    except Exception as exc:
        logger.warning("K-GIS lookup failed for '%s': %s", parcel_id, exc)

    # 2. Bhoomi (optional)
    base_url    = os.getenv("LAND_LOOKUP_BASE_URL", "")
    api_key     = os.getenv("LAND_LOOKUP_API_KEY",  "")
    placeholder = "https://api.example.karnataka.gov.in/land-records"
    if base_url and api_key and base_url != placeholder:
        try:
            polygon = _lookup_bhoomi_api(req, base_url, api_key)
            logger.info("Bhoomi lookup succeeded for '%s'", parcel_id)
            return polygon
        except Exception as exc:
            logger.warning("Bhoomi lookup failed for '%s': %s", parcel_id, exc)

    # 3. Simulation (always works)
    logger.warning("Using simulation fallback for '%s'", parcel_id)
    seed       = int(hashlib.sha256(parcel_id.encode()).hexdigest()[:8], 16)
    clon, clat = _get_district_centroid(req.district)
    return _simulate_parcel_polygon(clon, clat, seed)