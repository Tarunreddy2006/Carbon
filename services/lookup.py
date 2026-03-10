"""
services/land_lookup.py
─────────────────────────────────────────────────────────────────────────────
Land-parcel boundary lookup service.

Resolution chain (in priority order)
──────────────────────────────────────
  1. K-GIS Web API (KSRSAC)  – real cadastral polygons from Karnataka GIS
  2. Bhoomi / DILRMP API     – legacy stub kept for completeness
  3. Deterministic simulation – always available, no external dependencies

K-GIS API overview
───────────────────
Base URL: https://kgis.ksrsac.in:9000/genericwebservices/ws/

The API uses integer *codes* throughout, not plain names.  Resolving a
parcel boundary therefore requires a multi-step hierarchy walk:

  District name  →  district_code   (kgisadminhierarchy, type=District)
      ↓
  Taluk name     →  taluk_code      (kgisadminhierarchy, type=Taluk)
      ↓
  Hobli name     →  hobli_code      (kgisadminhierarchy, type=Hobli)
      ↓
  Village name   →  village_code    (kgisadminhierarchy, type=Village)
      ↓
  Survey number  →  polygon WKT     (kgissurveynumber)
      ↓
  WKT / coord array → GeoJSON Polygon

All K-GIS steps are wrapped in a single ``_lookup_kgis_polygon()`` call.
Any failure at any step raises an exception that is caught by
``get_parcel_boundary()``, which then transparently falls back to
simulation.
─────────────────────────────────────────────────────────────────────────────
"""

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

from models.parcel import ParcelRequest

logger = logging.getLogger(__name__)


# ─── K-GIS API constants ──────────────────────────────────────────────────────

# Base URL for all K-GIS generic web services.
# Override via KGIS_BASE_URL in .env if KSRSAC publishes a new endpoint.
KGIS_BASE_URL: str = os.getenv(
    "KGIS_BASE_URL",
    "https://kgis.ksrsac.in:9000/genericwebservices/ws",
)

# Department code and application code issued by KSRSAC.
# These are fixed public values for the Karnataka land-records application.
# Override via .env if your registration uses different codes.
KGIS_DEPT_CODE: str  = os.getenv("KGIS_DEPT_CODE",  "1")
KGIS_APPLN_CODE: str = os.getenv("KGIS_APPLN_CODE", "102")

# HTTP request timeout (seconds).  K-GIS can be slow on the first call.
KGIS_TIMEOUT: int = int(os.getenv("KGIS_TIMEOUT", "15"))

# Maximum retries for transient network failures.
KGIS_MAX_RETRIES: int = int(os.getenv("KGIS_MAX_RETRIES", "2"))


# ─── District centroid lookup (used by simulation fallback) ───────────────────
# WGS-84 approximate centroids for Karnataka districts.

KARNATAKA_DISTRICT_CENTROIDS: Dict[str, Tuple[float, float]] = {
    "Mysuru":             (76.6394, 12.2958),
    "Bengaluru":          (77.5946, 12.9716),
    "Mandya":             (76.8950, 12.5218),
    "Hassan":             (76.1000, 13.0033),
    "Kodagu":             (75.7480, 12.4244),
    "Tumakuru":           (77.1010, 13.3379),
    "Shivamogga":         (75.5681, 13.9299),
    "Dharwad":            (75.0078, 15.4589),
    "Belagavi":           (74.4977, 15.8497),
    "Kalaburagi":         (76.8240, 17.3297),
    "Davanagere":         (75.9238, 14.4663),
    "Chitradurga":        (76.3998, 14.2251),
    "Ballari":            (76.9214, 15.1394),
    "Vijayapura":         (75.7195, 16.8302),
    "Raichur":            (77.3566, 16.2120),
    "Udupi":              (74.7421, 13.3409),
    "Dakshina Kannada":   (75.0000, 12.8438),
    "Uttara Kannada":     (74.7902, 14.7937),
    "Chikkamagaluru":     (75.7720, 13.3161),
    "Chamarajanagar":     (77.0000, 11.9230),
    "Ramanagara":         (77.2780, 12.7157),
}

_DEFAULT_CENTROID: Tuple[float, float] = (76.6394, 12.2958)  # Mysuru fallback


# ─── HTTP session factory ─────────────────────────────────────────────────────

def _build_http_session() -> requests.Session:
    """
    Return a ``requests.Session`` configured with:
    - Automatic retry on transient 5xx / connection errors
    - Consistent timeout (applied at call sites, not here)
    - Permissive SSL verification flag read from env (useful for KSRSAC's
      self-signed certificate on port 9000).

    Note: Set KGIS_VERIFY_SSL=false in .env only on trusted internal networks.
    """
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


# Module-level session reused across requests within the same process.
_http: requests.Session = _build_http_session()


# ─── K-GIS helper: admin hierarchy resolver ───────────────────────────────────

def _kgis_get(endpoint: str, params: Dict[str, Any]) -> Any:
    """
    Execute a GET request against the K-GIS generic web services API.

    Parameters
    ----------
    endpoint : str
        Path segment appended to KGIS_BASE_URL, e.g. ``kgisadminhierarchy``.
    params : dict
        Query-string parameters forwarded verbatim to the API.

    Returns
    -------
    Any
        Parsed JSON response body.

    Raises
    ------
    requests.HTTPError
        On a non-2xx HTTP status code.
    requests.Timeout
        If the server does not respond within KGIS_TIMEOUT seconds.
    ValueError
        If the response body cannot be decoded as JSON.
    """
    url = f"{KGIS_BASE_URL.rstrip('/')}/{endpoint}"
    verify_ssl = os.getenv("KGIS_VERIFY_SSL", "true").lower() != "false"

    logger.debug("K-GIS GET %s  params=%s", url, params)

    resp = _http.get(url, params=params, timeout=KGIS_TIMEOUT, verify=verify_ssl)
    resp.raise_for_status()
    return resp.json()


def _resolve_code(
    type_label: str,
    name: str,
    parent_code: str,
    name_keys: Tuple[str, ...] = ("name", "distname", "talukname", "hobliname", "vname"),
    code_keys: Tuple[str, ...] = ("code", "distcode", "talukcode", "hoblicode", "vcode"),
) -> str:
    """
    Walk one level of the K-GIS admin hierarchy to resolve a *name* into a
    numeric *code*.

    The K-GIS ``kgisadminhierarchy`` endpoint returns a JSON array whose
    element schema varies slightly between hierarchy levels.  This function
    tries a set of candidate key names so it is resilient to minor schema
    differences.

    Example API call resolved here:
        GET kgisadminhierarchy
            ?deptcode=1&applncode=102&type=Taluk&code={district_code}

    Parameters
    ----------
    type_label : str
        Hierarchy level passed as the ``type`` parameter (e.g. ``"Taluk"``).
    name : str
        Human-readable name to match (case-insensitive, strip-normalised).
    parent_code : str
        Code of the *parent* entity whose children we are listing.
    name_keys : tuple of str
        Candidate JSON keys that may hold the entity name.
    code_keys : tuple of str
        Candidate JSON keys that may hold the entity code.

    Returns
    -------
    str
        The numeric code string for the matched entity.

    Raises
    ------
    ValueError
        If the API returns no results, or the requested name is not found.
    """
    params = {
        "deptcode":  KGIS_DEPT_CODE,
        "applncode": KGIS_APPLN_CODE,
        "type":      type_label,
        "code":      parent_code,
    }

    raw = _kgis_get("kgisadminhierarchy", params)

    # The API may return {"data": [...]} or directly a list.
    items: List[Dict] = raw if isinstance(raw, list) else raw.get("data", [])

    if not items:
        raise ValueError(
            f"K-GIS returned no {type_label} entries for parent code '{parent_code}'"
        )

    target = name.strip().lower()

    for item in items:
        # Try each candidate key for the display name
        for nk in name_keys:
            raw_name = item.get(nk)
            if raw_name and str(raw_name).strip().lower() == target:
                # Try each candidate key for the code
                for ck in code_keys:
                    if ck in item:
                        code = str(item[ck]).strip()
                        logger.debug(
                            "K-GIS resolved %s '%s' → code %s", type_label, name, code
                        )
                        return code

    raise ValueError(
        f"K-GIS: {type_label} '{name}' not found under parent code '{parent_code}'. "
        f"Available: {[item.get(name_keys[0], '?') for item in items[:10]]}"
    )


def _resolve_district_code(district_name: str) -> str:
    """
    Resolve a district name to its K-GIS district code.

    Uses type=District with code=0 (root), which returns all Karnataka
    districts.
    """
    logger.info("K-GIS: resolving district code for '%s'", district_name)
    return _resolve_code(
        type_label = "District",
        name       = district_name,
        parent_code= "0",          # root → all districts
        name_keys  = ("distname", "name", "DISTNAME", "district_name"),
        code_keys  = ("distcode", "code", "DISTCODE", "district_code"),
    )


def _resolve_taluk_code(taluk_name: str, district_code: str) -> str:
    """Resolve a taluk name to its K-GIS code within the given district."""
    logger.info(
        "K-GIS: resolving taluk code for '%s' (district=%s)", taluk_name, district_code
    )
    return _resolve_code(
        type_label = "Taluk",
        name       = taluk_name,
        parent_code= district_code,
        name_keys  = ("talukname", "name", "TALUKNAME", "taluk_name"),
        code_keys  = ("talukcode", "code", "TALUKCODE", "taluk_code"),
    )


def _resolve_hobli_code(hobli_name: str, taluk_code: str) -> str:
    """Resolve a hobli name to its K-GIS code within the given taluk."""
    logger.info(
        "K-GIS: resolving hobli code for '%s' (taluk=%s)", hobli_name, taluk_code
    )
    return _resolve_code(
        type_label = "Hobli",
        name       = hobli_name,
        parent_code= taluk_code,
        name_keys  = ("hobliname", "name", "HOBLINAME", "hobli_name"),
        code_keys  = ("hoblicode", "code", "HOBLICODE", "hobli_code"),
    )


def _resolve_village_code(village_name: str, hobli_code: str) -> str:
    """Resolve a village name to its K-GIS village code within the given hobli."""
    logger.info(
        "K-GIS: resolving village code for '%s' (hobli=%s)", village_name, hobli_code
    )
    return _resolve_code(
        type_label = "Village",
        name       = village_name,
        parent_code= hobli_code,
        name_keys  = ("vname", "villagename", "name", "VNAME", "village_name"),
        code_keys  = ("vcode", "villagecode", "code", "VCODE", "village_code"),
    )


# ─── K-GIS helper: survey polygon fetcher ────────────────────────────────────

def _fetch_kgis_survey_polygon(
    village_code: str,
    survey_no: str,
    hissa: Optional[str],
) -> Dict[str, Any]:
    """
    Call the K-GIS survey-number endpoint and return a GeoJSON Polygon.

    Endpoint
    ────────
        GET kgissurveynumber
            ?deptcode=1&applncode=102
            &villcode={village_code}
            &surveyno={survey_no}
            &hissano={hissa}          ← omitted if hissa is None

    The API response is expected to contain one of:
      • A ``geometry`` key with a GeoJSON Polygon / WKT string.
      • A ``coordinates`` key with a raw coordinate array.
      • A ``the_geom`` / ``geom`` WKT string (WGS-84).

    All three shapes are handled and normalised to a GeoJSON Polygon dict.

    Parameters
    ----------
    village_code : str
        Numeric village code resolved by the admin hierarchy walk.
    survey_no : str
        Survey / khasra number (may include alphanumeric suffixes).
    hissa : str or None
        Sub-division number.  Omitted from the request when None.

    Returns
    -------
    dict
        GeoJSON Polygon: ``{"type": "Polygon", "coordinates": [[...]]}``.

    Raises
    ------
    ValueError
        If the API response contains no usable geometry.
    """
    params: Dict[str, Any] = {
        "deptcode":  KGIS_DEPT_CODE,
        "applncode": KGIS_APPLN_CODE,
        "villcode":  village_code,
        "surveyno":  survey_no,
    }
    if hissa:
        params["hissano"] = hissa

    logger.info(
        "K-GIS: fetching survey polygon  village=%s  survey=%s  hissa=%s",
        village_code, survey_no, hissa or "—",
    )

    data = _kgis_get("kgissurveynumber", params)

    # The API may wrap results in a "data" list or return the feature directly.
    if isinstance(data, list):
        if not data:
            raise ValueError(
                f"K-GIS returned an empty list for village={village_code} "
                f"survey={survey_no}"
            )
        data = data[0]

    feature = data.get("data") or data  # unwrap one more level if present

    # ── Strategy 1: explicit GeoJSON geometry key ─────────────────────────
    for key in ("geometry", "geojson", "geo_json"):
        geom = feature.get(key)
        if isinstance(geom, dict) and geom.get("type") == "Polygon":
            logger.debug("K-GIS polygon extracted from key '%s'", key)
            return _normalise_geojson_polygon(geom)

    # ── Strategy 2: WKT string in the_geom / geom / wkt ──────────────────
    for key in ("the_geom", "geom", "wkt", "geometry_wkt", "shape"):
        wkt_val = feature.get(key)
        if isinstance(wkt_val, str) and wkt_val.strip().upper().startswith("POLYGON"):
            logger.debug("K-GIS polygon extracted from WKT key '%s'", key)
            return _wkt_polygon_to_geojson(wkt_val)

    # ── Strategy 3: raw coordinates array ────────────────────────────────
    for key in ("coordinates", "coords", "polygon_coordinates"):
        raw_coords = feature.get(key)
        if isinstance(raw_coords, list) and raw_coords:
            logger.debug("K-GIS polygon extracted from raw coords key '%s'", key)
            return _raw_coords_to_geojson(raw_coords)

    raise ValueError(
        f"K-GIS survey response contains no recognisable geometry. "
        f"Keys present: {list(feature.keys())}"
    )


# ─── GeoJSON normalisation utilities ─────────────────────────────────────────

def _normalise_geojson_polygon(geom: Dict[str, Any]) -> Dict[str, Any]:
    """
    Validate and lightly sanitise a GeoJSON Polygon dict.

    Ensures:
    - type == "Polygon"
    - coordinates is a list of rings, each ring a list of [lon, lat] pairs
    - The outer ring is closed (first == last vertex)
    - All coordinate values are Python floats (not strings)

    Parameters
    ----------
    geom : dict
        Raw GeoJSON geometry dict from the API.

    Returns
    -------
    dict
        Clean GeoJSON Polygon ready for Google Earth Engine.

    Raises
    ------
    ValueError
        If the geometry cannot be normalised into a valid Polygon.
    """
    if geom.get("type") != "Polygon":
        raise ValueError(f"Expected GeoJSON type 'Polygon', got '{geom.get('type')}'")

    rings = geom.get("coordinates")
    if not rings or not isinstance(rings, list):
        raise ValueError("GeoJSON Polygon has no coordinates")

    clean_rings: List[List[List[float]]] = []

    for ring in rings:
        if not ring or not isinstance(ring, list):
            continue

        # Coerce each vertex to [float, float]
        clean_ring: List[List[float]] = []
        for vertex in ring:
            if isinstance(vertex, (list, tuple)) and len(vertex) >= 2:
                clean_ring.append([float(vertex[0]), float(vertex[1])])
            elif isinstance(vertex, dict):
                # Some APIs return {"x": lon, "y": lat} or {"lon":..., "lat":...}
                lon = float(vertex.get("x") or vertex.get("lon") or vertex.get("longitude", 0))
                lat = float(vertex.get("y") or vertex.get("lat") or vertex.get("latitude",  0))
                clean_ring.append([lon, lat])

        if len(clean_ring) < 3:
            raise ValueError(f"Polygon ring has fewer than 3 vertices: {len(clean_ring)}")

        # Ensure the ring is closed
        if clean_ring[0] != clean_ring[-1]:
            clean_ring.append(clean_ring[0])

        clean_rings.append(clean_ring)

    if not clean_rings:
        raise ValueError("No valid rings found in GeoJSON Polygon")

    return {"type": "Polygon", "coordinates": clean_rings}


def _wkt_polygon_to_geojson(wkt: str) -> Dict[str, Any]:
    """
    Parse a WKT POLYGON string into a GeoJSON Polygon dict.

    Supports:
    - ``POLYGON ((lon lat, lon lat, …))``
    - ``POLYGON((lon lat,lon lat,…))``

    The coordinate order in Karnataka K-GIS WKT is (longitude latitude)
    per the WKT standard.

    Parameters
    ----------
    wkt : str
        Well-Known Text representation of the polygon.

    Returns
    -------
    dict
        GeoJSON Polygon.

    Raises
    ------
    ValueError
        If the WKT string cannot be parsed.
    """
    # Strip SRID prefix if present: "SRID=4326;POLYGON(…)"
    wkt = re.sub(r"^SRID=\d+;", "", wkt.strip(), flags=re.IGNORECASE).strip()

    # Extract all ring contents from POLYGON ((…),(…),…)
    ring_strings = re.findall(r"\(([^()]+)\)", wkt)

    if not ring_strings:
        raise ValueError(f"Cannot parse WKT polygon: {wkt[:120]}")

    rings: List[List[List[float]]] = []

    for ring_str in ring_strings:
        pairs = ring_str.strip().split(",")
        ring: List[List[float]] = []

        for pair in pairs:
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
    """
    Convert a bare coordinate list from the K-GIS API into a GeoJSON Polygon.

    Handles two common shapes:
    - Flat list of [lon, lat] pairs:  ``[[lon, lat], [lon, lat], …]``
    - Single outer ring already nested: ``[[[lon, lat], …]]``

    Parameters
    ----------
    coords : list
        Raw coordinate data from the API response.

    Returns
    -------
    dict
        GeoJSON Polygon.
    """
    # Detect if already in ring-of-rings format
    if (
        isinstance(coords[0], list)
        and isinstance(coords[0][0], list)
    ):
        # Already [[ring], [ring], …] – pass through normaliser
        return _normalise_geojson_polygon({"type": "Polygon", "coordinates": coords})

    # Flat list of [lon, lat] pairs — wrap in a single outer ring
    return _normalise_geojson_polygon({
        "type":        "Polygon",
        "coordinates": [coords],
    })


# ─── K-GIS top-level integration function ────────────────────────────────────

def _lookup_kgis_polygon(req: ParcelRequest) -> Dict[str, Any]:
    """
    Fetch a real parcel boundary from the K-GIS Web API (KSRSAC).

    Resolution sequence
    ───────────────────
    1. Resolve **district name** → district code
       (kgisadminhierarchy, type=District, code=0)

    2. Resolve **taluk name** → taluk code
       (kgisadminhierarchy, type=Taluk, code=district_code)

    3. Resolve **hobli name** → hobli code
       (kgisadminhierarchy, type=Hobli, code=taluk_code)
       ← If req.hobli is None, a best-effort search across all hoblis in the
         taluk is performed.

    4. Resolve **village name** → village code
       (kgisadminhierarchy, type=Village, code=hobli_code)

    5. Fetch survey polygon
       (kgissurveynumber, villcode=village_code, surveyno=..., hissano=...)

    6. Normalise the response to a GeoJSON Polygon and return.

    Parameters
    ----------
    req : ParcelRequest
        Validated cadastral lookup request.

    Returns
    -------
    dict
        GeoJSON Polygon: ``{"type": "Polygon", "coordinates": [[…]]}``.

    Raises
    ------
    Exception
        Any network, HTTP, or parsing error.  The caller (get_parcel_boundary)
        is responsible for catching this and triggering the simulation fallback.
    """
    logger.info(
        "K-GIS: starting resolution chain  district=%s  taluk=%s  village=%s  survey=%s",
        req.district, req.taluk, req.village, req.survey_no,
    )

    # ── Step 1: district ──────────────────────────────────────────────────
    district_code = _resolve_district_code(req.district)

    # ── Step 2: taluk ─────────────────────────────────────────────────────
    taluk_code = _resolve_taluk_code(req.taluk, district_code)

    # ── Step 3: hobli ─────────────────────────────────────────────────────
    # If the request includes an explicit hobli, resolve it directly.
    # Otherwise attempt to locate the village across all hoblis in the taluk.
    if req.hobli:
        hobli_code = _resolve_hobli_code(req.hobli, taluk_code)
    else:
        hobli_code = _infer_hobli_code(req.village, taluk_code)

    # ── Step 4: village ───────────────────────────────────────────────────
    village_code = _resolve_village_code(req.village, hobli_code)

    # ── Step 5: survey polygon ────────────────────────────────────────────
    polygon = _fetch_kgis_survey_polygon(village_code, req.survey_no, req.hissa)

    logger.info(
        "K-GIS: polygon fetched successfully  village_code=%s  survey=%s",
        village_code, req.survey_no,
    )
    return polygon


def _infer_hobli_code(village_name: str, taluk_code: str) -> str:
    """
    When ``req.hobli`` is not provided, search all hoblis in the taluk to find
    the one that contains the target village.

    This costs N additional API calls (one per hobli) and should only be
    exercised when the client omits the hobli field.  It logs a warning so
    operators know to encourage clients to supply hobli for performance.

    Parameters
    ----------
    village_name : str
        The village we are searching for.
    taluk_code : str
        Parent taluk code.

    Returns
    -------
    str
        The hobli code that contains the village.

    Raises
    ------
    ValueError
        If the village is not found in any hobli under this taluk.
    """
    logger.warning(
        "K-GIS: hobli not provided — scanning all hoblis in taluk %s for village '%s'. "
        "Supply 'hobli' in the request to avoid this performance penalty.",
        taluk_code, village_name,
    )

    params = {
        "deptcode":  KGIS_DEPT_CODE,
        "applncode": KGIS_APPLN_CODE,
        "type":      "Hobli",
        "code":      taluk_code,
    }
    raw = _kgis_get("kgisadminhierarchy", params)
    hoblis: List[Dict] = raw if isinstance(raw, list) else raw.get("data", [])

    if not hoblis:
        raise ValueError(f"K-GIS returned no hoblis for taluk code '{taluk_code}'")

    target = village_name.strip().lower()

    for hobli in hoblis:
        hobli_code = str(
            hobli.get("hoblicode")
            or hobli.get("code")
            or hobli.get("HOBLICODE", "")
        ).strip()

        if not hobli_code:
            continue

        try:
            # Check whether this hobli contains the target village
            village_params = {
                "deptcode":  KGIS_DEPT_CODE,
                "applncode": KGIS_APPLN_CODE,
                "type":      "Village",
                "code":      hobli_code,
            }
            vraw   = _kgis_get("kgisadminhierarchy", village_params)
            vlist: List[Dict] = vraw if isinstance(vraw, list) else vraw.get("data", [])

            for village in vlist:
                for nk in ("vname", "villagename", "name", "VNAME"):
                    if str(village.get(nk, "")).strip().lower() == target:
                        hobli_name = hobli.get("hobliname") or hobli.get("name") or hobli_code
                        logger.info(
                            "K-GIS: village '%s' found in hobli '%s' (code=%s)",
                            village_name, hobli_name, hobli_code,
                        )
                        return hobli_code
        except Exception as scan_exc:
            # A single hobli scan failure should not abort the entire search
            logger.debug(
                "K-GIS: hobli scan failed for code %s (%s) — continuing",
                hobli_code, scan_exc,
            )
            continue

    raise ValueError(
        f"K-GIS: village '{village_name}' not found in any hobli under "
        f"taluk code '{taluk_code}'"
    )


# ─── Legacy Bhoomi / DILRMP stub (preserved from original) ───────────────────

async def _lookup_bhoomi_api(
    req: ParcelRequest,
    base_url: str,
    api_key: str,
) -> Dict[str, Any]:
    """
    Call the Karnataka Bhoomi / DILRMP REST API to fetch the parcel geometry.

    This is a *stub* preserved for completeness.  The actual endpoint path
    and payload schema differ per deployment; update once API credentials are
    obtained.
    """
    url = f"{base_url.rstrip('/')}/parcel/boundary"
    payload = {
        "state":     req.state,
        "district":  req.district,
        "taluk":     req.taluk,
        "hobli":     req.hobli,
        "village":   req.village,
        "survey_no": req.survey_no,
        "hissa":     req.hissa,
    }
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type":  "application/json",
    }

    resp = requests.post(url, json=payload, headers=headers, timeout=10)
    resp.raise_for_status()

    data = resp.json()
    geometry = data.get("geometry") or data.get("parcel_geometry")
    if not geometry:
        raise ValueError(
            f"Unexpected Bhoomi API response shape: {list(data.keys())}"
        )

    logger.info("Bhoomi API: parcel geometry received")
    return geometry


# ─── Simulation fallback (preserved from original, unchanged) ─────────────────

def _parcel_seed(parcel_id: str) -> int:
    """Derive a stable integer seed from the canonical parcel ID."""
    digest = hashlib.sha256(parcel_id.encode()).hexdigest()
    return int(digest[:8], 16)


def _get_district_centroid(district: str) -> Tuple[float, float]:
    """Return (lon, lat) centroid for a Karnataka district."""
    return KARNATAKA_DISTRICT_CENTROIDS.get(district.strip().title(), _DEFAULT_CENTROID)


def _simulate_parcel_polygon(
    centroid_lon: float,
    centroid_lat: float,
    seed: int,
    area_ha_target: float = None,
) -> Dict[str, Any]:
    """
    Generate a realistic rectangular agricultural parcel polygon.

    The polygon is offset from the district centroid by a small random
    amount seeded deterministically, so the same parcel ID always returns
    the same boundary.  Used exclusively as a last-resort fallback when all
    live API calls fail.

    Parameters
    ----------
    centroid_lon, centroid_lat : float
        Base coordinate to offset from.
    seed : int
        Deterministic seed for reproducibility.
    area_ha_target : float, optional
        Approximate desired area (2–10 ha).  If None, randomly chosen.

    Returns
    -------
    dict  – GeoJSON Polygon geometry (type + coordinates).
    """
    rng = random.Random(seed)

    offset_lon = rng.uniform(-0.05, 0.05)
    offset_lat = rng.uniform(-0.05, 0.05)
    origin_lon = centroid_lon + offset_lon
    origin_lat = centroid_lat + offset_lat

    if area_ha_target is None:
        area_ha_target = rng.uniform(2.0, 10.0)

    lat_rad       = math.radians(origin_lat)
    m_per_deg_lat = 111_320.0
    m_per_deg_lon = 111_320.0 * math.cos(lat_rad)

    area_m2  = area_ha_target * 10_000.0
    side_m   = math.sqrt(area_m2)
    aspect   = rng.uniform(0.6, 1.4)
    width_m  = side_m * aspect
    height_m = area_m2 / width_m

    delta_lon = width_m  / m_per_deg_lon
    delta_lat = height_m / m_per_deg_lat

    sw = [round(origin_lon,             6), round(origin_lat,             6)]
    se = [round(origin_lon + delta_lon, 6), round(origin_lat,             6)]
    ne = [round(origin_lon + delta_lon, 6), round(origin_lat + delta_lat, 6)]
    nw = [round(origin_lon,             6), round(origin_lat + delta_lat, 6)]

    return {"type": "Polygon", "coordinates": [[sw, se, ne, nw, sw]]}


def _lookup_simulated(req: ParcelRequest, parcel_id: str) -> Dict[str, Any]:
    """
    Generate a stable simulated parcel polygon for the requested location.
    This is always the final fallback; it never raises.
    """
    seed        = _parcel_seed(parcel_id)
    clon, clat  = _get_district_centroid(req.district)
    polygon     = _simulate_parcel_polygon(clon, clat, seed)

    logger.info(
        "Simulation: polygon generated for '%s' centred at (%.4f, %.4f)",
        parcel_id, clon, clat,
    )
    return polygon


# ─── Public interface ─────────────────────────────────────────────────────────

def build_parcel_id(req: ParcelRequest) -> str:
    """
    Build a canonical parcel identifier from the cadastral hierarchy.

    Format: STATE/DISTRICT/TALUK/VILLAGE/SURVEY_NO[/HISSA]

    This string is used as a log key and as the simulation seed — it must
    remain stable regardless of which lookup backend is active.
    """
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


async def get_parcel_boundary(req: ParcelRequest) -> Dict[str, Any]:
    """
    Main entry point: return a GeoJSON Polygon for the requested parcel.

    Resolution cascade
    ──────────────────
      1. K-GIS Web API (KSRSAC) — requires network access to kgis.ksrsac.in
         Enabled unconditionally; failures are caught and logged.

      2. Bhoomi / DILRMP API — only attempted if LAND_LOOKUP_BASE_URL and
         LAND_LOOKUP_API_KEY are set in the environment and point to a real
         endpoint (not the placeholder value in .env).

      3. Deterministic simulation — always succeeds; used when all live APIs
         fail or are unconfigured.

    The returned geometry is always:
        {"type": "Polygon", "coordinates": [[[lon, lat], ...]]}

    This format is consumed unchanged by ``services/gee_service.py`` via
    ``ee.Geometry(geojson_geometry)``.

    Parameters
    ----------
    req : ParcelRequest
        Validated cadastral lookup request from the API layer.

    Returns
    -------
    dict
        GeoJSON Polygon geometry dict.

    Raises
    ------
    RuntimeError
        Only if the simulation itself fails (should never happen in practice).
    """
    parcel_id = build_parcel_id(req)
    logger.info("Parcel boundary requested: %s", parcel_id)

    # ── 1. K-GIS Web API ──────────────────────────────────────────────────
    logger.info("Fetching parcel boundary from K-GIS API")
    try:
        polygon = _lookup_kgis_polygon(req)
        logger.info("K-GIS lookup succeeded for parcel '%s'", parcel_id)
        return polygon
    except Exception as kgis_exc:
        logger.warning(
            "K-GIS lookup failed for '%s': %s — proceeding to next source",
            parcel_id, kgis_exc,
        )

    # ── 2. Bhoomi / DILRMP API (optional legacy path) ─────────────────────
    base_url = os.getenv("LAND_LOOKUP_BASE_URL", "")
    api_key  = os.getenv("LAND_LOOKUP_API_KEY",  "")
    placeholder = "https://api.example.karnataka.gov.in/land-records"

    if base_url and api_key and base_url != placeholder:
        logger.info("Fetching parcel boundary from Bhoomi/DILRMP API (%s)", base_url)
        try:
            polygon = await _lookup_bhoomi_api(req, base_url, api_key)
            logger.info("Bhoomi API lookup succeeded for parcel '%s'", parcel_id)
            return polygon
        except Exception as bhoomi_exc:
            logger.warning(
                "Bhoomi API lookup failed for '%s': %s — falling back to simulation",
                parcel_id, bhoomi_exc,
            )

    # ── 3. Deterministic simulation (guaranteed fallback) ─────────────────
    logger.warning(
        "K-GIS lookup failed, falling back to simulation for parcel '%s'", parcel_id
    )
    return _lookup_simulated(req, parcel_id)