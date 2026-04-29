"""
utils/factors.py
─────────────────────────────────────────────────────────────────────────────
Scientific constants and localized biomass density factors (Tons/HA) 
for Indian agroforestry species. Based on FSI and IPCC Tier 1/2 data.
─────────────────────────────────────────────────────────────────────────────
"""

# Biomass Density (Tons of Above Ground Biomass per Hectare)
# These represent the 'saturation' or 'max' capacity for various Indian species.
SPECIES_FACTORS = {
    "teak": 150.0,         # Tectona grandis
    "eucalyptus": 110.0,   # Fast growing, lower density per ha
    "neem": 95.0,          # Azadirachta indica
    "poplar": 85.0,        # Common in Northern Indian agroforestry
    "mango": 130.0,        # Mature orchards
    "mixed_tropical": 120.0 # Regional default fallback
}

# Scientific Conversion Constants
CARBON_FRACTION_AGB = 0.47    # IPCC Default (47% of dry biomass is carbon)
CO2_TO_CARBON_RATIO = 44 / 12 # Atomic weight ratio (3.6667)
SENTINEL_PIXEL_AREA_HA = 0.01 # 10m x 10m = 100sqm = 0.01 hectares