import joblib
import logging

logger = logging.getLogger(__name__)

# Mock IPCC constants in case utils/factors.py isn't fully updated yet
IPCC_CONSTANTS = {
    "Tropical Moist Forest": {"a": 0.0559, "b": 2.5, "c": 0.8},
    "Tropical Dry Forest": {"a": 0.112, "b": 2.5, "c": 0.6},
    "Default": {"a": 0.06, "b": 2.4, "c": 0.7}
}

try:
    # Attempt to load from utils.factors if available
    from utils.factors import IPCC_CONSTANTS
except ImportError:
    pass

# 1. Load the ML Model into memory globally
try:
    biomass_model = joblib.load('models/random_forest_v1.joblib')
except FileNotFoundError:
    logger.warning("ML Model not found at models/random_forest_v1.joblib. Falling back to default baseline.")
    biomass_model = None

def calculate_confidence(c_per_ha: float) -> float:
    """
    Dynamically calculates system confidence based on realistic biosphere limits (0 - 600 t C/ha).
    """
    if c_per_ha <= 0:
        return 0.01
    elif c_per_ha <= 400:
        return 0.95  # Standard high confidence range
    elif c_per_ha <= 600:
        # Linear decay from 0.95 to 0.50
        return 0.95 - ((c_per_ha - 400) / 200) * 0.45
    else:
        # Exponential decay penalty for impossible biosphere values
        return max(0.01, 0.50 * (600 / c_per_ha))

def run_carbon_pipeline(veg_pixels: int, ndvi_mean: float, sar_vv: float, sar_vh: float, canopy_height: float, biome_name: str = "Default"):
    """
    ML-Driven Biomass Inference with IPCC Allometric Tuning.
    """
    features = [[ndvi_mean, sar_vv, sar_vh, canopy_height]]
    
    # 2. Base ML Inference
    if biomass_model:
        raw_ml_output = biomass_model.predict(features)[0]
    else:
        raw_ml_output = 12000.0 # Fallback mock data
        
    # FIX 1: Scale Factor Division (Convert from scaled kg/ha raster data to metric tonnes/ha)
    base_biomass_per_ha = raw_ml_output / 100.0
    
    # 3. IPCC Allometric Tuning (B = a * D^b * H^c)
    # FIX 2: All hardcoded limits removed. Strictly continuous math.
    constants = IPCC_CONSTANTS.get(biome_name, IPCC_CONSTANTS["Default"])
    a, b, c = constants["a"], constants["b"], constants["c"]
    
    # Calculate mathematically tuned biomass
    tuned_biomass_per_ha = a * (base_biomass_per_ha ** b) * (canopy_height ** c)
    
    # 4. Total Area Extrapolation
    area_ha = veg_pixels * 0.01 
    total_biomass = tuned_biomass_per_ha * area_ha
    
    # 5. Carbon & CO2e Conversion
    carbon_tons = total_biomass * 0.47
    carbon_per_ha = tuned_biomass_per_ha * 0.47
    co2e_tons = carbon_tons * 3.67
    
    # FIX 3: Dynamic Confidence Scoring Anchor
    confidence = calculate_confidence(carbon_per_ha)
    
    return {
        "area_hectares": round(area_ha, 2),
        "biomass_per_ha": round(tuned_biomass_per_ha, 2),
        "total_carbon_tons": round(carbon_tons, 2),
        "co2_equivalent_tons": round(co2e_tons, 2),
        "confidence_score": round(confidence, 3)
    }

def calculate_confidence_score(pixel_count, images_used, ndvi_std):
    """
    Calculates a scientific confidence percentage based on signal stability.
    """
    sample_penalty = max(0, (5 - images_used) * 5)
    variance_penalty = min(20, (ndvi_std * 50)) if ndvi_std else 0
    score = 98.0 - sample_penalty - variance_penalty
    return round(max(min(score, 99.5), 65.0), 1)
