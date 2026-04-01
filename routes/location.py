from fastapi import APIRouter
from starlette.concurrency import run_in_threadpool
import logging
import os
import requests
import urllib3
urllib3.disable_warnings()

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Locations"])

#<<<<<<< Updated upstream
#=======
KGIS_WS_BASE = os.getenv("KGIS_BASE_URL", "https://kgis.ksrsac.in:9000/genericwebservices/ws").rstrip("/")
KGIS_TIMEOUT = int(os.getenv("KGIS_TIMEOUT", "15"))
KGIS_VERIFY_SSL = os.getenv("KGIS_VERIFY_SSL", "true").lower() != "false"


def _kgis_json(endpoint: str, params: dict | None = None):
    url = f"{KGIS_WS_BASE}/{endpoint.lstrip('/')}"
    resp = requests.get(url, params=params or {}, timeout=KGIS_TIMEOUT, verify=KGIS_VERIFY_SSL)
    resp.raise_for_status()
    data = resp.json()
    if isinstance(data, dict):
        for key in ("data", "result", "Data", "Result"):
            if isinstance(data.get(key), list):
                return data[key]
        return [data]
    return data if isinstance(data, list) else []


def _district_list_from_kgis():
    rows = _kgis_json("districtcode")
    out = []

    for row in rows:
        if isinstance(row, str) and row.strip():
            out.append({"code": row.strip(), "name": row.strip()})
            continue
        if not isinstance(row, dict):
            continue

        # K-GIS payloads vary by deployment; accept both camelCase and generic keys.
        name = str(
            row.get("districtName")
        ).strip()
        code = str(
            row.get("districtcode")
        ).strip()

        # Some K-GIS envs return name-only rows; keep them instead of failing.
        if name and not code:
            code = name
        if code and not name:
            name = code

        if name and code:
            out.append({"code": code, "name": name})

    if not out:
        raise ValueError("districtcode returned no usable district rows")

    # Deduplicate while preserving stable output for the UI.
    uniq = {(r["code"], r["name"]): r for r in out}
    return sorted(uniq.values(), key=lambda x: x["name"].lower())

#>>>>>>> Stashed changes
# ── Karnataka static hierarchy ────────────────────────────────────────────────
# District names use canonical K-GIS spellings confirmed from districtcode
# endpoint probing. Taluk names use standard Karnataka revenue records.
# Hobli and village data requires K-GIS credentials — those fields use
# free-text input which is passed directly to the estimation backend.

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


def _district_list():
    """Return all districts as [{code, name}] sorted alphabetically."""
    return [
        {"code": name, "name": name}
        for name in sorted(KARNATAKA_HIERARCHY.keys())
    ]


def _taluk_list(districtcode: str):
    """Return taluks for a district as [{code, name}]."""
    taluks = KARNATAKA_HIERARCHY.get(districtcode, [])
    return [{"code": t, "name": t} for t in sorted(taluks)]


def _hobli_list(talukcode: str):
    """
    Hobli data requires K-GIS credentials — not available without auth.
    Return a single placeholder entry that signals the frontend to switch
    the hobli and village fields to free-text input.
    """
    return []


def _village_list(hobli_code: str):
    """Village data requires K-GIS credentials."""
    return []


def _survey_list(village_code: str):
    """Survey data requires K-GIS credentials."""
    return []

def _polygon_list(surveyno: str):
    """Survey data requires K-GIS credentials."""
    return []
def _coordinates(surveyno: str):
    return []


# ── Proxy endpoints ───────────────────────────────────────────────────────────

@router.get("/districts")
async def get_districts():
    """Returns all 30 Karnataka districts from static data — always succeeds."""
    return _district_list()


@router.get("/taluks/{districtcode}")
async def get_taluks(districtcode: str):
    """Returns taluks for the given district from static data."""
    return _taluk_list(districtcode)


@router.get("/hoblis/{talukcode}")
async def get_hoblis(talukcode: str):
    """
    Returns [] — hobli data requires K-GIS credentials.
    Frontend switches hobli/village/survey to free-text inputs.
    """
    return _hobli_list(talukcode)


@router.get("/villages/{hobli_code}")
async def get_villages(hobli_code: str):
    return _village_list(hobli_code)


@router.get("/surveynumbers/{village_code}")
async def get_surveynumbers(village_code: str):
    return _survey_list(village_code)