from fastapi import APIRouter
from starlette.concurrency import run_in_threadpool
from services.lookup import (
    _kgis_get, _normalise_hierarchy_response,
    KGIS_DEPT_CODE, KGIS_APPLN_CODE,
)
import logging

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Locations"])


def _fetch_hierarchy(type_label: str, code: str):
    """
    Fetch one level of the K-GIS admin hierarchy.

    Returns a normalised list.  Never raises — on any K-GIS failure returns []
    so the frontend receives a valid 200 response and can switch to manual input
    mode rather than showing a permanent error state.
    """
    try:
        raw = _kgis_get(
            "kgisadminhierarchy",
            {
                "deptcode":  KGIS_DEPT_CODE,
                "applncode": KGIS_APPLN_CODE,
                "type":      type_label,
                "code":      code,
            },
        )
        return _normalise_hierarchy_response(raw, context=f"{type_label}(code={code})")
    except Exception as exc:
        # K-GIS is unreachable or returned null/invalid JSON.
        # Return [] so the frontend can gracefully fall back to manual text entry
        # rather than showing a 502 error that permanently breaks the dropdowns.
        logger.warning(
            "K-GIS %s lookup failed (code=%s) — returning [] for graceful fallback: %s",
            type_label, code, exc,
        )
        return []


def _fetch_survey(village_code: str):
    """
    Fetch survey numbers for a village.  Returns [] on any K-GIS failure.
    """
    try:
        raw = _kgis_get(
            "kgissurveynumber",
            {
                "deptcode":  KGIS_DEPT_CODE,
                "applncode": KGIS_APPLN_CODE,
                "villcode":  village_code,
            },
        )
        return _normalise_hierarchy_response(raw, context=f"surveynumbers(village={village_code})")
    except Exception as exc:
        logger.warning(
            "K-GIS survey lookup failed (village=%s) — returning []: %s",
            village_code, exc,
        )
        return []


# ── Proxy endpoints ───────────────────────────────────────────────────────────
# These always return HTTP 200 with a list (possibly empty).
# The frontend detects an empty /districts response and switches to manual
# text-input mode so the user can still submit the estimation form.

@router.get("/districts")
async def get_districts():
    return await run_in_threadpool(_fetch_hierarchy, "District", "0")

@router.get("/taluks/{district_code}")
async def get_taluks(district_code: str):
    return await run_in_threadpool(_fetch_hierarchy, "Taluk", district_code)

@router.get("/hoblis/{taluk_code}")
async def get_hoblis(taluk_code: str):
    return await run_in_threadpool(_fetch_hierarchy, "Hobli", taluk_code)

@router.get("/villages/{hobli_code}")
async def get_villages(hobli_code: str):
    return await run_in_threadpool(_fetch_hierarchy, "Village", hobli_code)

@router.get("/surveynumbers/{village_code}")
async def get_surveynumbers(village_code: str):
    return await run_in_threadpool(_fetch_survey, village_code)