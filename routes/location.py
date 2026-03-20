from fastapi import APIRouter
from starlette.concurrency import run_in_threadpool
import logging
import os
import requests
import urllib3
urllib3.disable_warnings()

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Locations"])

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


def _taluk_list(district_code: str):
    """Return taluks for a district as [{code, name}]."""
    taluks = KARNATAKA_HIERARCHY.get(district_code, [])
    return [{"code": t, "name": t} for t in sorted(taluks)]


def _hobli_list(taluk_code: str):
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


# ── Proxy endpoints ───────────────────────────────────────────────────────────

@router.get("/districts")
async def get_districts():
    """Returns all 30 Karnataka districts from static data — always succeeds."""
    return _district_list()


@router.get("/taluks/{district_code}")
async def get_taluks(district_code: str):
    """Returns taluks for the given district from static data."""
    return _taluk_list(district_code)


@router.get("/hoblis/{taluk_code}")
async def get_hoblis(taluk_code: str):
    """
    Returns [] — hobli data requires K-GIS credentials.
    Frontend switches hobli/village/survey to free-text inputs.
    """
    return _hobli_list(taluk_code)


@router.get("/villages/{hobli_code}")
async def get_villages(hobli_code: str):
    return _village_list(hobli_code)


@router.get("/surveynumbers/{village_code}")
async def get_surveynumbers(village_code: str):
    return _survey_list(village_code)