"""
utils/logic.py
─────────────────────────────────────────────────────────────────────────────
The core mathematical engine.
Now features a data-driven Asset Verification Index for true confidence scores,
mathematically clamped claimable areas, and safe numpy/polars scaling.
─────────────────────────────────────────────────────────────────────────────
"""
import joblib
import logging
import numpy as np
import pandas as pd
import polars as pl

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

def calculate_asset_confidence(ndvi: float, vv: float, vh: float, rh95: float, scenes_used: int = 0) -> float:
    """
    Calculates an asset-specific confidence score based on remote sensing data quality,
    statistical training drift, and biophysical sanity checks.

    KILL-SWITCH: If GEE returned zero cloud-free scenes, the data is entirely
    fallback/default values. Granting high confidence on fabricated data is fraud.
    Immediately return the minimum floor score of 5.0%.
    """
    # ══════════════════════════════════════════════════════════════════════
    # THE KILL-SWITCH: Zero scenes = zero trust
    # ══════════════════════════════════════════════════════════════════════
    if scenes_used == 0:
        logger.warning("🚨 KILL-SWITCH ACTIVATED: 0 satellite scenes used. Confidence forced to 5.0%.")
        return 5.0

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
        (ndvi, 'ndvi'),
        (rh95, 'height'),
        (vv, 'vv'),
        (vh, 'vh')
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
    if rh95 > 22.0 and ndvi < 0.35:
        total_penalty += 30.0
        
    # Dense radar scattering with low height indicates possible calibration drift or wet soil interference
    if vh > -10.0 and rh95 < 4.0:
        total_penalty += 20.0

    # 4. Low scene count degrades trust even when data looks normal
    if scenes_used < 5:
        total_penalty += (5 - scenes_used) * 3.0

    # Base assessment integrity begins at 99.0% for pristine, central-profile data
    calculated_score = 99.0 - total_penalty
    
    # Return bounded score between a floor of 5% and ceiling of 99.5%
    return round(max(5.0, min(calculated_score, 99.5)), 1)

def run_carbon_pipeline(parcel_area_ha: float, ndvi: float, evi: float, ndmi: float, vv: float, vh: float, elevation: float, slope: float, rh95: float, veg_pixels: int = 0, biome_name: str = "Default", scenes_used: int = 0) -> dict:
    """
    ML-Driven Biomass Inference Engine with Asset Integrity Guardrails.
    
    Returns a dictionary with the CANONICAL API CONTRACT keys that the
    frontend and tasks.py both depend on:
        area_hectares, parcel_area_ha, biomass_per_ha, total_biomass_tons,
        total_carbon_tons, co2_equivalent_tons, confidence_score
    """
    if biomass_model and feature_scaler:
        # Define strict feature column template in exact training order
        feature_cols = [
            'NDVI',
            'EVI',
            'NDMI',
            'VV',
            'VH',
            'VV_VH_ratio',
            'elevation',
            'slope',
            'rh95',
            'CVI'
        ]

        # ======================================================
        # DERIVED FEATURE COMPUTATION with non-zero denominators
        # ======================================================
        safe_vh_abs = max(0.01, abs(vh))
        vv_vh_ratio = vv / safe_vh_abs
        cvi = vh * rh95

        # ======================================================
        # DIAGNOSTIC: Pre-Scaler Feature Matrix Logging
        # ======================================================
        diag_df = pd.DataFrame([{
            'ndvi': ndvi, 'evi': evi, 'ndmi': ndmi,
            'vv': vv, 'vh': vh, 'vv_vh_ratio': vv_vh_ratio,
            'elevation': elevation, 'slope': slope,
            'rh95': rh95, 'cvi': cvi,
        }])
        logger.info("PRE-SCALER FEATURE MATRIX DIAGNOSTIC")
        logger.info(f"\n{diag_df.to_string(index=False)}")
        logger.info(f"Data types:\n{diag_df.dtypes.to_string()}")
        nan_check = diag_df.isnull().any().any()
        zero_check = (diag_df == 0.0).any().any()
        logger.info(f"Contains NaN/None: {nan_check} | Contains structural 0.0: {zero_check}")
        if nan_check:
            logger.warning("NaN DETECTED in feature matrix!")
        if zero_check:
            zero_cols = diag_df.columns[(diag_df == 0.0).any()].tolist()
            logger.warning(f"Structural 0.0 detected in columns: {zero_cols}")

        # 1. Create Polars DataFrame with all 10 features pre-computed
        raw_features_df = pl.DataFrame({
            "NDVI": [ndvi],
            "EVI": [evi],
            "NDMI": [ndmi],
            "VV": [vv],
            "VH": [vh],
            "VV_VH_ratio": [vv_vh_ratio],
            "elevation": [elevation],
            "slope": [slope],
            "rh95": [rh95],
            "CVI": [cvi],
        }).select(feature_cols)

        # Convert Polars DataFrame to NumPy for scaler transform
        scaled_features = feature_scaler.transform(raw_features_df.to_numpy())

        # ======================================================
        # DIAGNOSTIC: Raw vs Clamped Prediction Tracking
        # ======================================================
        raw_prediction = float(biomass_model.predict(scaled_features)[0])
        tuned_biomass_per_ha = max(0.0, raw_prediction)
        logger.info("MODEL INFERENCE DIAGNOSTIC")
        logger.info(f"Raw unclamped prediction : {raw_prediction:.6f} t/ha")
        logger.info(f"Clamped production weight: {tuned_biomass_per_ha:.6f} t/ha")
        if raw_prediction < 0.0:
            logger.warning(f"NEGATIVE RAW PREDICTION -- under-run variance: {raw_prediction:.6f}")
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
    # Pass scenes_used so the kill-switch can fire on zero-scene fallback data
    # Map new parameters to the existing confidence function signature
    confidence = calculate_asset_confidence(ndvi, vv, vh, rh95, scenes_used=scenes_used)
    
    return {
        # ══════════════════════════════════════════════════════════════
        # THE API CONTRACT — these keys are read by tasks.py AND the
        # frontend JS.  Renaming any key here WILL cause the 0t bug.
        # ══════════════════════════════════════════════════════════════
        "area_hectares": round(effective_claimable_area, 2),
        "parcel_area_ha": round(parcel_area_ha, 2),
        "biomass_per_ha": round(float(tuned_biomass_per_ha), 2),
        "total_biomass_tons": round(float(total_biomass), 2),
        "total_carbon_tons": round(float(carbon_tons), 2),
        "co2_equivalent_tons": round(float(co2e_tons), 2),
        "confidence_score": round(confidence, 1)
    }
