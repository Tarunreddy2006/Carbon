"""
utils/logic.py
─────────────────────────────────────────────────────────────────────────────
The core mathematical engine. Uses Sensor Fusion (Optical + Radar) 
to estimate carbon sequestration without manual intervention.
─────────────────────────────────────────────────────────────────────────────
"""

import math
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

def run_carbon_pipeline(veg_pixels, ndvi_mean, sar_vh, opt_imgs, rad_imgs, species="mixed_tropical"):
    """
    Sensor Fusion Model: Merges Sentinel-2 (Optical) and Sentinel-1 (Radar).
    Radar provides structural density; Optical provides chlorophyll health.
    """
    area_ha = veg_pixels * 0.01 # Total vegetation canopy area
    max_density = SPECIES_FACTORS.get(species.lower(), 120.0)

    # 1. Optical AGB Estimation (Exponential Curve)
    # Based on standard AGB-NDVI relationships in subtropical regions
    optical_agb_density = 14.5 * math.exp(2.5 * max(0, ndvi_mean))

    # 2. Radar AGB Estimation (Structural)
    # VH backscatter correlates with wood volume. Normal range -25 to -10.
    radar_structure_index = max(0.1, (sar_vh + 25) / 15) 
    radar_agb_density = max_density * 0.5 * radar_structure_index

    # 3. Fusion Weighting
    # If we have more radar data (cloudy seasons), we trust radar structure more.
    total_imgs = opt_imgs + rad_imgs
    opt_weight = opt_imgs / total_imgs if total_imgs > 0 else 0.5
    
    fused_density = min(max_density, (optical_agb_density * opt_weight) + (radar_agb_density * (1 - opt_weight)))
    
    biomass_tons = fused_density * area_ha
    carbon_tons = biomass_tons * CARBON_FRACTION_AGB
    co2e_tons = carbon_tons * CO2_TO_CARBON_RATIO

    return {
        "canopy_area_hectares": round(area_ha, 2),
        "biomass_density_tons_per_ha": round(fused_density, 2),
        "biomass_tons": round(biomass_tons, 2),
        "carbon_tons": round(carbon_tons, 2),
        "co2_equivalent_tons": round(co2e_tons, 2),
        "image_count": total_imgs
    }