"""
utils/factors.py
─────────────────────────────────────────────────────────────────────────────
Scientific constants and localized biomass density factors (Tons/HA) 
for Indian agroforestry species. Based on FSI and IPCC Tier 1/2 data.
─────────────────────────────────────────────────────────────────────────────
"""

# Biomass Density Equations - IPCC Tier 2/3 Constants (a, b, c)
# For the equation: Biomass = a * D^b * H^c
IPCC_CONSTANTS = {
    "Tropical Moist Forest": {"a": 0.0559, "b": 2.5, "c": 0.8},
    "Tropical Dry Forest": {"a": 0.112, "b": 2.5, "c": 0.6},
    "Boreal Taiga": {"a": 0.082, "b": 2.4, "c": 0.7},
    "Temperate Broadleaf": {"a": 0.065, "b": 2.45, "c": 0.75},
    "Default": {"a": 0.06, "b": 2.4, "c": 0.7}
}

# Scientific Conversion Constants
CARBON_FRACTION_AGB = 0.47    # IPCC Default (47% of dry biomass is carbon)
CO2_TO_CARBON_RATIO = 44 / 12 # Atomic weight ratio (3.6667)
SENTINEL_PIXEL_AREA_HA = 0.01 # 10m x 10m = 100sqm = 0.01 hectares