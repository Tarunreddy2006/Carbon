from fastapi import APIRouter, HTTPException
from starlette.concurrency import run_in_threadpool
import json
import logging
import os
from pathlib import Path
from typing import Any, Dict, List

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Locations"])

CODES_JSON_PATH = Path(os.getenv("LOCATION_CODES_JSON", "codes.json"))


def _first(d: Dict[str, Any], keys: List[str]) -> str:
    for k in keys:
        v = d.get(k)
        if v is not None and str(v).strip():
            return str(v).strip()
    return ""


def _to_code_name_rows(items: Any, name_keys: List[str], code_keys: List[str]) -> List[Dict[str, str]]:
    rows: List[Dict[str, str]] = []
    if not isinstance(items, list):
        return rows

    for item in items:
        if isinstance(item, str):
            rows.append({"code": item.strip(), "name": item.strip()})
            continue
        if not isinstance(item, dict):
            continue

        name = _first(item, name_keys)
        code = _first(item, code_keys)
        if name and not code:
            code = name
        if code and not name:
            name = code
        if name and code:
            rows.append({"code": code, "name": name})

    # dedupe + stable sort
    uniq = {(r["code"], r["name"]): r for r in rows}
    return sorted(uniq.values(), key=lambda x: x["name"].lower())


def _normalise_codes_dataset(raw: Any) -> Dict[str, Any]:
    """
    Normalise codes.json into a 4-level hierarchy:
    district -> taluk -> hobli -> village
    preserving code/name pairs for API responses.
    """
    districts: List[Dict[str, Any]] = []

    if isinstance(raw, dict) and isinstance(raw.get("districts"), list):
        district_items = raw["districts"]
    elif isinstance(raw, list):
        district_items = raw
    elif isinstance(raw, dict):
        district_items = [{"name": k, **(v if isinstance(v, dict) else {})} for k, v in raw.items()]
    else:
        district_items = []

    for d in district_items:
        if not isinstance(d, dict):
            continue

        d_name = _first(d, ["name", "districtName", "district", "distname"])
        d_code = _first(d, ["code", "districtCode", "district_code", "distcode", "DISTCODE"])
        if d_name and not d_code:
            d_code = d_name
        if d_code and not d_name:
            d_name = d_code
        if not (d_name and d_code):
            continue

        taluk_items = d.get("taluks") or d.get("talukList") or d.get("children") or []
        taluks: List[Dict[str, Any]] = []
        for t in taluk_items if isinstance(taluk_items, list) else []:
            if isinstance(t, str):
                taluks.append({"code": t, "name": t, "hoblis": []})
                continue
            if not isinstance(t, dict):
                continue

            t_name = _first(t, ["name", "talukName", "taluk", "talukname"])
            t_code = _first(t, ["code", "talukCode", "taluk_code", "talukcode", "TALUKCODE"])
            if t_name and not t_code:
                t_code = t_name
            if t_code and not t_name:
                t_name = t_code
            if not (t_name and t_code):
                continue

            hobli_items = t.get("hoblis") or t.get("hobliList") or t.get("children") or []
            hoblis: List[Dict[str, Any]] = []
            for h in hobli_items if isinstance(hobli_items, list) else []:
                if isinstance(h, str):
                    hoblis.append({"code": h, "name": h, "villages": []})
                    continue
                if not isinstance(h, dict):
                    continue

                h_name = _first(h, ["name", "hobliName", "hobli", "hobliname"])
                h_code = _first(h, ["code", "hobliCode", "hobli_code", "hoblicode", "HOBLICODE"])
                if h_name and not h_code:
                    h_code = h_name
                if h_code and not h_name:
                    h_name = h_code
                if not (h_name and h_code):
                    continue

                village_items = h.get("villages") or h.get("villageList") or h.get("children") or []
                villages = _to_code_name_rows(
                    village_items,
                    ["name", "villageName", "village", "villagename", "vname"],
                    ["code", "villageCode", "village_code", "vcode", "VCODE"],
                )
                hoblis.append({"code": h_code, "name": h_name, "villages": villages})

            taluks.append({"code": t_code, "name": t_name, "hoblis": hoblis})

        districts.append({"code": d_code, "name": d_name, "taluks": taluks})

    return {"districts": districts}


def _load_codes_json() -> Dict[str, Any]:
    if not CODES_JSON_PATH.exists():
        raise FileNotFoundError(f"codes.json not found at: {CODES_JSON_PATH}")
    with CODES_JSON_PATH.open("r", encoding="utf-8") as f:
        return _normalise_codes_dataset(json.load(f))


def _find_district(data: Dict[str, Any], districtcode: str) -> Dict[str, Any] | None:
    key = districtcode.strip().lower()
    for d in data["districts"]:
        if d["code"].strip().lower() == key or d["name"].strip().lower() == key:
            return d
    return None


def _find_taluk(data: Dict[str, Any], talukcode: str) -> Dict[str, Any] | None:
    key = talukcode.strip().lower()
    for d in data["districts"]:
        for t in d.get("taluks", []):
            if t["code"].strip().lower() == key or t["name"].strip().lower() == key:
                return t
    return None


def _find_hobli(data: Dict[str, Any], hoblicode: str) -> Dict[str, Any] | None:
    key = hoblicode.strip().lower()
    for d in data["districts"]:
        for t in d.get("taluks", []):
            for h in t.get("hoblis", []):
                if h["code"].strip().lower() == key or h["name"].strip().lower() == key:
                    return h
    return None


@router.get("/districts")
async def get_districts():
    try:
        data = await run_in_threadpool(_load_codes_json)
        rows = [{"code": d["code"], "name": d["name"]} for d in data["districts"]]
        return sorted(rows, key=lambda x: x["name"].lower())
    except Exception as exc:
        logger.error("codes.json district load failed: %s", exc)
        raise HTTPException(status_code=500, detail="Unable to load districts from codes.json")


@router.get("/taluks/{districtcode}")
async def get_taluks(districtcode: str):
    try:
        data = await run_in_threadpool(_load_codes_json)
        district = _find_district(data, districtcode)
        if not district:
            return []
        rows = [{"code": t["code"], "name": t["name"]} for t in district.get("taluks", [])]
        return sorted(rows, key=lambda x: x["name"].lower())
    except Exception as exc:
        logger.error("codes.json taluk load failed for district '%s': %s", districtcode, exc)
        raise HTTPException(status_code=500, detail="Unable to load taluks from codes.json")


@router.get("/hoblis/{talukcode}")
async def get_hoblis(talukcode: str):
    try:
        data = await run_in_threadpool(_load_codes_json)
        taluk = _find_taluk(data, talukcode)
        if not taluk:
            return []
        rows = [{"code": h["code"], "name": h["name"]} for h in taluk.get("hoblis", [])]
        return sorted(rows, key=lambda x: x["name"].lower())
    except Exception as exc:
        logger.error("codes.json hobli load failed for taluk '%s': %s", talukcode, exc)
        raise HTTPException(status_code=500, detail="Unable to load hoblis from codes.json")


@router.get("/villages/{hobli_code}")
async def get_villages(hobli_code: str):
    try:
        data = await run_in_threadpool(_load_codes_json)
        hobli = _find_hobli(data, hobli_code)
        if not hobli:
            return []
        return hobli.get("villages", [])
    except Exception as exc:
        logger.error("codes.json village load failed for hobli '%s': %s", hobli_code, exc)
        raise HTTPException(status_code=500, detail="Unable to load villages from codes.json")


@router.get("/surveynumbers/{village_code}")
async def get_surveynumbers(village_code: str):
    # Survey numbers are still resolved from K-GIS lookup flow, not codes.json.
    return []
