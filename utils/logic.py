"""
utils/logic.py
─────────────────────────────────────────────────────────────────────────────
The core mathematical engine.
Now features a data-driven Asset Verification Index for true confidence scores,
mathematically clamped claimable areas, and safe numpy/pandas scaling.
─────────────────────────────────────────────────────────────────────────────
"""
import joblib
import logging
import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)

# Load the ML Model and the Scaler into memory globally
try:
    biomass_model = joblib.load('models/carbonestimator.pkl')
    feature_scaler = joblib.load('models/feature_scaler.pkl')
    logger.info("✅ ML Model and Scaler loaded successfully.")
except FileNotFoundError as e:
    logger.warning(f"ML Assets not found: {e}. Falling back to default baseline.")
    biomass_model = None
    feature_scaler = None

def calculate_asset_confidence(ndvi_mean: float, sar_vv: float, sar_vh: float, canopy_height: float) -> float:
    """
    Calculates an asset-specific confidence score based on remote sensing data quality,
    statistical training drift, and biophysical sanity checks.
    """
    # Baseline statistical profiles calculated directly from training datasets
    baselines = {
        'ndvi': {'mean': 0.58, 'std': 0.15, 'min': 0.05, 'max': 0.95},
        'height': {'mean': 18.2, 'std': 8.5, 'min': 0.0, 'max': 60.0},
        'vv': {'mean': -9.8, 'std': 2.9, 'min': -25.0, 'max': -1.0},
        'vh': {'mean': -16.5, 'std': 3.8, 'min': -30.0, 'max': -5.0}
    }
    
    total_penalty = 0.0
    
    # 1. Extrapolation Risk Profile (Statistical Z-Score Check)
    features_to_check = [
        (ndvi_mean, 'ndvi'),
        (canopy_height, 'height'),
        (sar_vv, 'vv'),
        (sar_vh, 'vh')
    ]
    
    for current_val, key in features_to_check:
        profile = baselines[key]
        # Calculate standard deviations away from the historical mean
        z_score = abs(current_val - profile['mean']) / profile['std']
        
        # Penalize data proportionately to its drift from normal profiles
        if z_score > 0.0:
            total_penalty += z_score * 2.5
            
        # 2. Hard Biophysical Boundary Violations
        if current_val < profile['min'] or current_val > profile['max']:
            total_penalty += 15.0

    # 3. Sensor Contradiction Matrix
    # High structural canopy height combined with low greenness implies data anomalies or cloud shadows
    if canopy_height > 22.0 and ndvi_mean < 0.35:
        total_penalty += 30.0
        
    # Dense radar scattering with low height indicates possible calibration drift or wet soil interference
    if sar_vh > -10.0 and canopy_height < 4.0:
        total_penalty += 20.0

    # Base assessment integrity begins at 99.0% for pristine, central-profile data
    calculated_score = 99.0 - total_penalty
    
    # Return bounded score between a floor of 5% and ceiling of 99.5%
    return round(max(5.0, min(calculated_score, 99.5)), 1)

def run_carbon_pipeline(veg_pixels: int, ndvi_mean: float, sar_vv: float, sar_vh: float, canopy_height: float, parcel_area_ha: float, biome_name: str = "Default"):
    """
    ML-Driven Biomass Inference Engine with Asset Integrity Guardrails.
    """
    if biomass_model and feature_scaler:
        # 1. Recreate exact advanced structural features used in training
        # Pure Python prevents Numpy array dimension crashes for the StandardScaler
        safe_sar_vv = sar_vv if sar_vv != 0.0 else 1e-5
        radar_ratio = sar_vh / safe_sar_vv
        
        canopy_volume_index = (sar_vh - sar_vv) * canopy_height
        optical_height_proxy = ndvi_mean * canopy_height
        
        feature_cols = ['canopy_height', 'ndvi_mean', 'sar_vv', 'sar_vh', 'radar_ratio', 'canopy_volume_index', 'optical_height_proxy']
        
        raw_features_df = pd.DataFrame([[
            canopy_height, 
            ndvi_mean, 
            sar_vv, 
            sar_vh, 
            radar_ratio, 
            canopy_volume_index, 
            optical_height_proxy
        ]], columns=feature_cols)

        # Apply scaling transformation matrix
        scaled_features = feature_scaler.transform(raw_features_df)
        tuned_biomass_per_ha = biomass_model.predict(scaled_features)[0]
    else:
        tuned_biomass_per_ha = 120.0
        
    # ==========================================
    # THE VECTOR-RASTER FIX
    # ==========================================
    # Land area calculation based on chunky pixel grid geometry
    canopy_area_ha = veg_pixels * 0.01 
    
    # 🚨 THE FAILSAFE: If optical sensors are completely blinded by clouds (0 pixels),
    # assume the canopy covers the full drawn polygon area.
    if canopy_area_ha == 0.0 or veg_pixels == 0:
        canopy_area_ha = parcel_area_ha
    
    # Cap the claimable area so it NEVER exceeds the legal drawn boundary
    effective_claimable_area = min(parcel_area_ha, canopy_area_ha)
    
    # Multiply by the CAP, not the raw grid area!
    total_biomass = tuned_biomass_per_ha * effective_claimable_area
    
    # Standard environmental carbon fraction (IPCC default factor: 0.47)
    carbon_tons = total_biomass * 0.47
    
    # Financial Registry Compliance Multiplier (Exactly 44/12 rounded)
    co2e_tons = carbon_tons * 3.67
    
    # Compute the non-random asset data integrity metrics
    confidence = calculate_asset_confidence(ndvi_mean, sar_vv, sar_vh, canopy_height)
    
    return {
        "parcel_area_ha": round(parcel_area_ha, 2),
        "claimable_vegetation_ha": round(effective_claimable_area, 2),
        "biomass_per_ha": round(float(tuned_biomass_per_ha), 2),
        "total_carbon_tons": round(float(carbon_tons), 2),
        "co2_equivalent_tons": round(float(co2e_tons), 2),
        "confidence_score": round(confidence, 1)
    }
