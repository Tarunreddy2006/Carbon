# Save this exactly as training.py
import pandas as pd
import numpy as np
import joblib
import os
from sklearn.model_selection import KFold, RandomizedSearchCV
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import r2_score, mean_absolute_percentage_error
import xgboost as xgb

# Silence the Windows Loky Core warning completely
os.environ["LOKY_MAX_CPU_COUNT"] = "4"

print("🚀 Loading multi-sensor calibration dataset...")
df = pd.read_csv("carbon_model_training_500_rows.csv")

# ==================== 1. FIXED ACCURATE GEOSPATIAL FEATURE ENGINEERING ====================
# 🔴 FIX A: Convert raw logarithmic Decibels (dB) to Linear Power values first
df['vv_linear'] = 10 ** (df['sar_vv'] / 10)
df['vh_linear'] = 10 ** (df['sar_vh'] / 10)

# 🔴 FIX B: Calculate a true physical radar volume cross-ratio using linear fields
df['radar_ratio'] = df['vh_linear'] / (df['vv_linear'] + 1e-6)

# 🔴 FIX C: Compute Radar Vegetation Index (RVI) -> Standard industry proxy for tree volume
df['rvi'] = (4 * df['vh_linear']) / (df['vv_linear'] + df['vh_linear'] + 1e-6)

# 🔴 FIX D: Build a positive 3D Canopy Volume Index (Height * True Volume Proxy)
df['canopy_volume_index'] = df['rvi'] * df['canopy_height']

# Keep the optical height calculation since it behaves normally
df['optical_height_proxy'] = df['ndvi_mean'] * df['canopy_height']

# Update feature columns to use the new mathematically sound inputs
feature_cols = ['canopy_height', 'ndvi_mean', 'radar_ratio', 'rvi', 'canopy_volume_index', 'optical_height_proxy']
# ===========================================================================================

# 🔴 CRITICAL FIX: DATA EXPANSION TO PREVENT OVERFITTING 
if len(df) < 300:
    print("📈 Dataset size is below optimal thresholds. Applying high-fidelity spatial expansion...")
    expanded_chunks = []
    for _ in range(5):
        corrupted_copy = df.copy()
        corrupted_copy['ndvi_mean'] = np.clip(corrupted_copy['ndvi_mean'] + np.random.normal(0, 0.02, len(df)), 0.1, 0.98)
        
        # Apply the physical variance directly to the raw satellite decibels before scaling
        corrupted_copy['sar_vh'] = corrupted_copy['sar_vh'] + np.random.normal(0, 0.3, len(df))
        corrupted_copy['biomass_per_ha'] = corrupted_copy['biomass_per_ha'] * np.random.uniform(0.95, 1.05, len(df))
        expanded_chunks.append(corrupted_copy)
    df = pd.concat(expanded_chunks, ignore_index=True)
    
    # Re-trigger linear conversion for expanded rows to ensure mathematical continuity
    df['vv_linear'] = 10 ** (df['sar_vv'] / 10)
    df['vh_linear'] = 10 ** (df['sar_vh'] / 10)
    df['radar_ratio'] = df['vh_linear'] / (df['vv_linear'] + 1e-6)
    df['rvi'] = (4 * df['vh_linear']) / (df['vv_linear'] + df['vh_linear'] + 1e-6)
    df['canopy_volume_index'] = df['rvi'] * df['canopy_height']
    df['optical_height_proxy'] = df['ndvi_mean'] * df['canopy_height']

X = df[feature_cols]
y = df['biomass_per_ha']

# 2. STANDARD SCALING (Normalizes heights, indices, and linear values uniformly)
scaler = StandardScaler()
X_scaled = pd.DataFrame(scaler.fit_transform(X), columns=feature_cols)
print(f"📊 Extracted scaled feature matrix: {X_scaled.shape[1]} inputs across {X_scaled.shape[0]} expanded rows.")

# 3. Setting Up 5-Fold Cross-Validation Matrix
kf = KFold(n_splits=5, shuffle=True, random_state=42)
xgb_r2_scores, xgb_mape_scores = [], []

xgb_param_dist = {
    'n_estimators': [100,150, 200],
    'max_depth': [4, 5, 6],
    'learning_rate': [0.03, 0.05],
    'subsample': [0.8, 0.9],
    'colsample_bytree': [0.8, 0.9]
}

print("🏋️‍♂️ Tuning and training high-dimensional ensemble regressors...")
for fold, (train_idx, val_idx) in enumerate(kf.split(X_scaled, y)):
    X_train, X_val = X_scaled.iloc[train_idx], X_scaled.iloc[val_idx]
    y_train, y_val = y.iloc[train_idx], y.iloc[val_idx]
    
    base_xgb = xgb.XGBRegressor(objective='reg:squarederror', random_state=42, n_jobs=-1)
    xgb_search = RandomizedSearchCV(base_xgb, param_distributions=xgb_param_dist, n_iter=8, cv=3, random_state=42, n_jobs=-1)
    xgb_search.fit(X_train, y_train)
    
    best_xgb_model = xgb_search.best_estimator_
    xgb_pred = best_xgb_model.predict(X_val)
    
    xgb_r2_scores.append(r2_score(y_val, xgb_pred))
    xgb_mape_scores.append(mean_absolute_percentage_error(y_val, xgb_pred) * 100)

print("\n🎯 ==================== UPGRADED MODEL ACCURACY REPORT ====================")
print(f"| Model Framework | Mean Correlation Score (R²) | Mean Percentage Error (MAPE) |")
print(f"|------------------|-----------------------------|------------------------------|")
print(f"| 📈 Optimized XGB | {np.mean(xgb_r2_scores):.4f} | {np.mean(xgb_mape_scores):.2f}% |")
print("==========================================================================")

joblib.dump(best_xgb_model, 'carbonestimator.pkl')
joblib.dump(scaler, 'feature_scaler.pkl')
print("\n🏆 Saved the optimized weights and feature scaler safely to disk!")
