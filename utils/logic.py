"""
utils/logic.py
─────────────────────────────────────────────────────────────────────────────
The core mathematical engine. Uses Sensor Fusion (Optical + Radar) 
to estimate carbon sequestration without manual intervention.
─────────────────────────────────────────────────────────────────────────────
"""

import math
import joblib
from .factors import IPCC_CONSTANTS, CARBON_FRACTION_AGB, CO2_TO_CARBON_RATIO

# Load model into memory once
try:
    biomass_model = joblib.load('/app/models/random_forest_v1.joblib')
except FileNotFoundError:
    biomass_model = None

def calculate_confidence_score(pixel_count, images_used, ndvi_std):
    """
    Calculates a scientific confidence percentage based on signal stability.
    """
    # Penalty for low data frequency
    sample_penalty = max(0, (5 - images_used) * 5)
    # Penalty for high heterogeneity in small parcels (likely non-forest pixels)
    variance_penalty = min(20, (ndvi_std * 50)) if ndvi_std else 0
    
    score = 98.0 - sample_penalty - variance_penalty
    return round(max(min(score, 99.5), 65.0), 1)

def run_carbon_pipeline(veg_pixels: int, ndvi_mean: float, sar_vv: float, sar_vh: float, canopy_height: float, biome_name: str = "Default"):
    """
    ML-Driven Biomass Inference with IPCC Allometric Tuning.
    """
    # 1. Feature Engineering
    # Match the training data shape: [ndvi, sar_vv, sar_vh, canopy_height]
    features = [[ndvi_mean, sar_vv, sar_vh, canopy_height]]
    
    # 2. Base ML Inference
    if biomass_model:
        base_biomass_per_ha = biomass_model.predict(features)[0]
    else:
        # Fallback if model fails to load
        base_biomass_per_ha = 120.0 

    # 3. IPCC Allometric Tuning (B = a * D^b * H^c)
    # Using the base_biomass as a proxy for structural density (D)
    constants = IPCC_CONSTANTS.get(biome_name, IPCC_CONSTANTS["Default"])
    a, b, c = constants["a"], constants["b"], constants["c"]
    
    tuned_biomass_per_ha = a * (base_biomass_per_ha ** b) * (canopy_height ** c)
    
    # 4. Total Area Extrapolation
    area_ha = veg_pixels * 0.01 
    total_biomass = tuned_biomass_per_ha * area_ha
    
    # 5. Carbon & CO2e Conversion (Standard MRV conversion factors)
    carbon_tons = total_biomass * 0.47
    co2e_tons = carbon_tons * 3.67
    
    return {
        "area_hectares": round(area_ha, 2),
        "biomass_per_ha": round(tuned_biomass_per_ha, 2),
        "total_carbon_tons": round(carbon_tons, 2),
        "co2_equivalent_tons": round(co2e_tons, 2),
        "confidence_score": 0.95 # Placeholder for future model probability scoring
    }
