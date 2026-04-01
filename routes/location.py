from fastapi import APIRouter
from starlette.concurrency import run_in_threadpool
import json
import logging
import os
from pathlib import Path
from typing import Any, Dict, List

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Locations"])

CODES_JSON_PATH = Path(os.getenv("LOCATION_CODES_JSON", "codes.json"))

# ── Karnataka static hierarchy (fallback only) ───────────────────────────────
KARNATAKA_HIERARCHY = {
    "Bagalkote":         ["Bagalkote","Bilagi","Hungund","Jamakhandi","Mudhol","Rabakavi Banhatti"],
    "Ballari":           ["Ballari","Hadagali","Hagaribommanahalli","Hospete","Kudligi","Sandur","Siruguppa"],
    "Belagavi":          ["Athani","Bailhongal","Belagavi","Chikodi","Gokak","Hukkeri","Khanapur","Mudalgi","Nippani","Raibag","Ramdurg","Savadatti"],
    "Bengaluru (Rural)": ["Devanahalli","Doddaballapura","Hosakote","Nelamangala"],
    "Bengaluru (Urban)": ["Anekal","Bangalore East","Bangalore North","Bangalore South","Bangalore West"],
    "Bidar":             ["Aurad","Basavakalyana","Bhalki","Bidar","Humnabad"],
    "Chamarajanagara":   ["Chamarajanagara","Gundlupete","Kollegal","Yelandur"],
    "Chikkaballapura":   ["Bagepalli","Chikkaballapura","Chintamani","Gauribidanur","Gudibande","Sidlaghatta"],
    "Chikkamagaluru":    ["Birur","Chikkamagaluru","Kadur","Koppa","Mudigere","NR Pura","Sringeri","Tarikere"],
    "Chitradurga":       ["Challakere","Chitradurga","Hiriyur","Holalkere","Hosadurga","Molakalmuru"],
    "Dakshina Kannada":  ["Bantval","Belthangady","Mangaluru","Puttur","Sullia"],
    "Davanagere":        ["Channagiri","Davanagere","Harihara","Honnali","Jagalur","Nyamathi"],
    "Dharwad":           ["Dharwad","Hubli","Kalghatgi","Kundagol","Navalgund"],
    "Gadag":             ["Gadag","Mundargi","Naragund","Ron","Shirahatti"],
    "Hassan":            ["Alur","Arakalagudu","Arkalgud","Belur","Channarayapatna","Hassan","Holenarasipur","Sakaleshapura"],
    "Haveri":            ["Byadgi","Hangal","Haveri","Hirekerur","Ranebennur","Savanur","Shiggaon"],
    "Kalaburagi":        ["Afzalpur","Aland","Chincholi","Chittapur","Jevargi","Kalaburagi","Sedam"],
    "Kodagu":            ["Madikeri","Somwarpet","Virajpete"],
    "Kolara":            ["Bangarpet","Kolara","Malur","Mulbagal","Srinivasapura"],
    "Koppal":            ["Gangavathi","Koppal","Kushtagi","Yelburga"],
    "Mandya":            ["Kirugavalu","Krishnarajanagara","Maddur","Malavalli","Mandya","Nagamangala","Pandavapura","Srirangapatna"],
    "Mysuru":            ["HD Kote","Hunsur","KR Nagar","Mysuru","Nanjangud","Periyapatna","TN Pura"],
    "Raichur":           ["Devadurga","Lingsugur","Manvi","Raichur","Sindhanur"],
    "Ramanagara":        ["Channapatna","Kanakapura","Magadi","Ramanagara"],
    "Shivamogga":        ["Bhadravati","Hosanagara","Sagara","Shikaripur","Shivamogga","Soraba","Thirthahalli"],
    "Tumakuru":          ["Chikkanayakanahalli","Gubbi","Koratagere","Kunigal","Madhugiri","Pavagada","Sira","Tiptur","Tumakuru","Turuvekere"],
    "Udupi":             ["Karkala","Kundapura","Udupi"],
    "Uttara Kannada":    ["Ankola","Bhatkal","Dandeli","Haliyal","Honavar","Joida","Karwar","Kumta","Mundgod","Siddapur","Supa","Yellapur"],
    "Vijayapura":        ["Basavana Bagewadi","Indi","Muddebihal","Sindagi","Vijayapura"],
    "Yadgir":            ["Gurumitkal","Hunasagi","Shahapur","Shorapur","Yadgir"],
}


def _first(d: Dict[str, Any], keys: List[str]) -> str:
    for k in keys:
        v = d.get(k)
        if v is not None and str(v).strip():
            return str(v).strip()
    return ""


def _normalise_codes_dataset(raw: Any) -> Dict[str, Any]:
    """Return {'districts':[{'code','name','taluks':[{'code','name'}]}]} from variable codes.json shapes."""
    districts: List[Dict[str, Any]] = []

    source: List[Any]
    if isinstance(raw, dict) and isinstance(raw.get("districts"), list):
        source = raw["districts"]
    elif isinstance(raw, list):
        source = raw
    elif isinstance(raw, dict):
        # Shape: {"Bagalkote": {"code":"02", "taluks":[...]}, ...}
        source = [{"name": k, **(v if isinstance(v, dict) else {})} for k, v in raw.items()]
    else:
        source = []

    for item in source:
        if not isinstance(item, dict):
            continue
        d_name = _first(item, ["name", "districtName", "district", "distname"])
        d_code = _first(item, ["code", "districtCode", "district_code", "distcode", "DISTCODE"])
        taluks_raw = item.get("taluks") or item.get("talukList") or item.get("children") or []

        taluks: List[Dict[str, str]] = []
        if isinstance(taluks_raw, list):
            for t in taluks_raw:
                if isinstance(t, str):
                    taluks.append({"code": t, "name": t})
                    continue
                if not isinstance(t, dict):
                    continue
                t_name = _first(t, ["name", "talukName", "taluk", "talukname"])
                t_code = _first(t, ["code", "talukCode", "taluk_code", "talukcode", "TALUKCODE"])
                if t_name and not t_code:
                    t_code = t_name
                if t_code and not t_name:
                    t_name = t_code
                if t_name and t_code:
                    taluks.append({"code": t_code, "name": t_name})

        if d_name and not d_code:
            d_code = d_name
        if d_code and not d_name:
            d_name = d_code

        if d_name and d_code:
            districts.append({"code": d_code, "name": d_name, "taluks": taluks})

    return {"districts": districts}


def _load_codes_json() -> Dict[str, Any]:
    if not CODES_JSON_PATH.exists():
        raise FileNotFoundError(f"codes.json not found at: {CODES_JSON_PATH}")
    with CODES_JSON_PATH.open("r", encoding="utf-8") as f:
        return _normalise_codes_dataset(json.load(f))


def _district_list() -> List[Dict[str, str]]:
    data = _load_codes_json()
    rows = [{"code": d["code"], "name": d["name"]} for d in data["districts"]]
    if not rows:
        raise ValueError("codes.json has no districts")
    return sorted(rows, key=lambda x: x["name"].lower())


def _taluk_list(districtcode: str) -> List[Dict[str, str]]:
    data = _load_codes_json()
    target = districtcode.strip().lower()
    for district in data["districts"]:
        if district["code"].strip().lower() == target or district["name"].strip().lower() == target:
            return sorted(district.get("taluks", []), key=lambda x: x["name"].lower())
    return []


def _district_list_fallback() -> List[Dict[str, str]]:
    return [{"code": name, "name": name} for name in sorted(KARNATAKA_HIERARCHY.keys())]


def _taluk_list_fallback(districtcode: str) -> List[Dict[str, str]]:
    taluks = KARNATAKA_HIERARCHY.get(districtcode, [])
    return [{"code": t, "name": t} for t in sorted(taluks)]


def _hobli_list(talukcode: str):
    return []


def _village_list(hobli_code: str):
    return []


def _survey_list(village_code: str):
    return []


@router.get("/districts")
async def get_districts():
    """Return districts from codes.json as [{code, name}]."""
    try:
        return await run_in_threadpool(_district_list)
    except Exception as exc:
        logger.warning("codes.json district load failed, using static fallback: %s", exc)
        return _district_list_fallback()


@router.get("/taluks/{districtcode}")
async def get_taluks(districtcode: str):
    """Return taluks from codes.json for district code or district name."""
    try:
        return await run_in_threadpool(_taluk_list, districtcode)
    except Exception as exc:
        logger.warning("codes.json taluk load failed for district '%s': %s", districtcode, exc)
        return _taluk_list_fallback(districtcode)


@router.get("/hoblis/{talukcode}")
async def get_hoblis(talukcode: str):
    return _hobli_list(talukcode)


@router.get("/villages/{hobli_code}")
async def get_villages(hobli_code: str):
    return _village_list(hobli_code)


@router.get("/surveynumbers/{village_code}")
async def get_surveynumbers(village_code: str):
    return _survey_list(village_code)
