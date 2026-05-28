"""
utils/logic.py
─────────────────────────────────────────────────────────────────────────────
The core mathematical engine. Uses Sensor Fusion (Optical + Radar) 
to estimate carbon sequestration without manual intervention.
─────────────────────────────────────────────────────────────────────────────
"""

import math
# Assuming you have these constants defined in factors.py. 
# If not, you can replace them with hardcoded values (e.g., CARBON_FRACTION_AGB = 0.47)
from .factors import SPECIES_FACTORS, CARBON_FRACTION_AGB, CO2_TO_CARBON_RATIO

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

def run_carbon_pipeline(veg_pixels: int, ndvi_mean: float, sar_vh: float, opt_imgs: int, rad_imgs: int, species: str = "mixed_tropical"):
    """
    Sensor Fusion Model with Saturation Damper.
    Adjusts weights dynamically based on canopy density to avoid carbon underestimation.
    """
    if not species:
        species = "mixed_tropical"
    area_ha = veg_pixels * 0.01 
    max_density = SPECIES_FACTORS.get(species.lower(), 120.0)

    # 1. Calculate Individual Sensor Densities
    # Optical: Exponential health curve
    optical_agb_density = 14.5 * math.exp(2.5 * max(0, ndvi_mean))

    # Radar: Structural wood volume based on VH backscatter
    radar_structure_index = max(0.1, (sar_vh + 25) / 15) 
    radar_agb_density = max_density * 0.5 * radar_structure_index

    # 2. IMPLEMENTATION: Saturation Damper Logic
    # Problem: NDVI saturates at 0.8; wood growth continues but optical sensor is 'blind'
    if ndvi_mean > 0.8:
        # Force the model to trust structural Radar (80%) over blinded Optical (20%)
        opt_weight = 0.2
        rad_weight = 0.8
    else:
        # Fallback to standard data-frequency based weighting
        total_imgs = opt_imgs + rad_imgs
        opt_weight = opt_imgs / total_imgs if total_imgs > 0 else 0.5
        rad_weight = 1.0 - opt_weight

    # 3. Calculate Fused Density using Adjusted Weights
    fused_density = (optical_agb_density * opt_weight) + (radar_agb_density * rad_weight)
    
    # Apply species-specific ceiling
    fused_density = min(max_density, fused_density)
    
    # 4. Standard Carbon Math
    biomass_tons = fused_density * area_ha
    carbon_tons = biomass_tons * CARBON_FRACTION_AGB
    co2e_tons = carbon_tons * CO2_TO_CARBON_RATIO

    return {
        "canopy_area_hectares": round(area_ha, 2),
        "biomass_density_tons_per_ha": round(fused_density, 2),
        "biomass_tons": round(biomass_tons, 2),
        "carbon_tons": round(carbon_tons, 2),
        "co2_equivalent_tons": round(co2e_tons, 2),
        "image_count": opt_imgs + rad_imgs,
        "fusion_ratio": f"Optical {int(opt_weight*100)}% / Radar {int(rad_weight*100)}%"
    }
