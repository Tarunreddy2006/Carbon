import warnings
import joblib
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt

from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import (
    r2_score,
    mean_squared_error,
    mean_absolute_percentage_error
)

from xgboost import XGBRegressor

warnings.filterwarnings("ignore")

# ==========================================================
# CONFIG
# ==========================================================

CSV_FILE = "Carbon_SouthIndia_Final_Training.csv"

MODEL_FILE = "carbonestimator.pkl"
SCALER_FILE = "feature_scaler.pkl"
IMPORTANCE_FILE = "feature_importance.png"

# ==========================================================
# LOAD DATA
# ==========================================================

print("Loading dataset...")

df = pd.read_csv(CSV_FILE)

print("Original Shape:", df.shape)

# ==========================================================
# CLEAN DATA
# ==========================================================

# Remove metadata columns if present
for col in ["system:index", ".geo"]:
    if col in df.columns:
        df.drop(columns=[col], inplace=True)

# Remove extreme EVI outliers
df = df[
    (df["EVI"] > -5) &
    (df["EVI"] < 5)
]

# Remove missing values
df = df.dropna()

print("Clean Shape:", df.shape)

# ==========================================================
# FEATURE ENGINEERING
# ==========================================================

print("Creating CVI feature...")

# Recommended by your AI Lead
df["CVI"] = df["VH"] * df["rh95"]

# ==========================================================
# FEATURES
# ==========================================================

FEATURES = [
    "NDVI",
    "EVI",
    "NDMI",
    "VV",
    "VH",
    "VV_VH_ratio",
    "elevation",
    "slope",
    "rh95",
    "CVI"
]

TARGET = "agbd"

X = df[FEATURES]
y = df[TARGET]

# ==========================================================
# TRAIN TEST SPLIT
# ==========================================================

X_train, X_test, y_train, y_test = train_test_split(
    X,
    y,
    test_size=0.20,
    random_state=42
)

print("Train Samples:", len(X_train))
print("Test Samples:", len(X_test))

# ==========================================================
# SCALE FEATURES
# ==========================================================

scaler = StandardScaler()

X_train_scaled = scaler.fit_transform(X_train)
X_test_scaled = scaler.transform(X_test)

joblib.dump(
    scaler,
    SCALER_FILE
)

print(f"Scaler saved -> {SCALER_FILE}")

# ==========================================================
# XGBOOST MODEL
# ==========================================================

print("Training XGBoost...")

model = XGBRegressor(
    objective="reg:squarederror",
    n_estimators=500,
    learning_rate=0.05,
    max_depth=4,
    subsample=0.8,
    colsample_bytree=0.8,
    random_state=42,
    n_jobs=-1
)

model.fit(
    X_train_scaled,
    y_train,
    eval_set=[(X_test_scaled, y_test)],
    verbose=False
)

# ==========================================================
# PREDICTIONS
# ==========================================================

predictions = model.predict(
    X_test_scaled
)

# ==========================================================
# METRICS
# ==========================================================

r2 = r2_score(
    y_test,
    predictions
)

rmse = np.sqrt(
    mean_squared_error(
        y_test,
        predictions
    )
)

mape = (
    mean_absolute_percentage_error(
        y_test,
        predictions
    ) * 100
)

print("\n============================")
print("MODEL PERFORMANCE")
print("============================")
print(f"R²   : {r2:.4f}")
print(f"RMSE : {rmse:.4f}")
print(f"MAPE : {mape:.2f}%")
print("============================")

# ==========================================================
# FEATURE IMPORTANCE
# ==========================================================

importance_df = pd.DataFrame({
    "Feature": FEATURES,
    "Importance": model.feature_importances_
})

importance_df = importance_df.sort_values(
    by="Importance",
    ascending=False
)

print("\nFeature Importance:\n")
print(importance_df)

# Plot
plt.figure(figsize=(10, 6))

plt.barh(
    importance_df["Feature"],
    importance_df["Importance"]
)

plt.gca().invert_yaxis()

plt.title(
    "Carbon Biomass Model Feature Importance"
)

plt.xlabel("Importance")

plt.tight_layout()

plt.savefig(
    IMPORTANCE_FILE,
    dpi=300
)

print(
    f"\nFeature importance plot saved -> {IMPORTANCE_FILE}"
)

# ==========================================================
# SAVE MODEL
# ==========================================================

joblib.dump(
    model,
    MODEL_FILE
)

print(
    f"Model saved -> {MODEL_FILE}"
)

print("\nTraining Complete.")
