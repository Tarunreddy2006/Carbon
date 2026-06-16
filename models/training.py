"""
Retrain the operational South India biomass estimator.

This script fits the exact 10-feature production schema consumed by
utils.logic.run_carbon_pipeline and overwrites the live model artifacts:
models/carbonestimator.pkl and models/feature_scaler.pkl.

Feature column order MUST match the exact mixed-case nomenclature used
in both the training CSV and utils/logic.py:
    NDVI, EVI, NDMI, VV, VH, VV_VH_ratio, elevation, slope, rh95, CVI
"""
from pathlib import Path
import pickle

import pandas as pd
from sklearn.metrics import mean_absolute_error, r2_score
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from xgboost import XGBRegressor


BASE_DIR = Path(__file__).resolve().parent
DATASET_PATH = BASE_DIR / "Carbon_SouthIndia_Final_Training.csv"
MODEL_PATH = BASE_DIR / "carbonestimator.pkl"
SCALER_PATH = BASE_DIR / "feature_scaler.pkl"

# ══════════════════════════════════════════════════════════════════════════
# CANONICAL FEATURE SCHEMA — mixed-case, matching CSV headers exactly.
# This is the single source of truth shared with utils/logic.py.
# ══════════════════════════════════════════════════════════════════════════
FEATURE_SCHEMA = [
    "NDVI",
    "EVI",
    "NDMI",
    "VV",
    "VH",
    "VV_VH_ratio",
    "elevation",
    "slope",
    "rh95",
    "CVI",
]

TARGET_COLUMN = "agbd"


def load_training_frame(dataset_path: Path = DATASET_PATH) -> pd.DataFrame:
    if not dataset_path.exists():
        raise FileNotFoundError(f"Training dataset not found: {dataset_path}")

    df = pd.read_csv(dataset_path)

    # Validate that all required columns exist in the CSV
    required_columns = FEATURE_SCHEMA + [TARGET_COLUMN]
    missing = [column for column in required_columns if column not in df.columns]
    if missing:
        raise ValueError(f"Training dataset missing required columns: {missing}")

    # Select only the columns we need — no renaming required since
    # FEATURE_SCHEMA already matches the CSV header case exactly
    training_df = df[required_columns].copy()
    training_df = training_df.apply(pd.to_numeric, errors="coerce")
    training_df = training_df.replace([float("inf"), float("-inf")], pd.NA)
    training_df = training_df.dropna(subset=FEATURE_SCHEMA + [TARGET_COLUMN])

    if training_df.empty:
        raise ValueError("Training dataset has no valid rows after numeric cleaning.")

    return training_df


def train() -> dict:
    training_df = load_training_frame()
    x = training_df[FEATURE_SCHEMA].to_numpy(dtype=float)
    y = training_df[TARGET_COLUMN]

    x_train, x_test, y_train, y_test = train_test_split(
        x,
        y,
        test_size=0.2,
        random_state=42,
    )

    scaler = StandardScaler()
    x_train_scaled = scaler.fit_transform(x_train)
    x_test_scaled = scaler.transform(x_test)

    model = XGBRegressor(
        n_estimators=150,
        max_depth=6,
        learning_rate=0.05,
        subsample=0.9,
        colsample_bytree=0.9,
        objective="reg:squarederror",
        random_state=42,
        n_jobs=-1,
    )
    model.fit(x_train_scaled, y_train)

    predictions = model.predict(x_test_scaled)
    metrics = {
        "rows_used": int(len(training_df)),
        "features": FEATURE_SCHEMA,
        "r2": float(r2_score(y_test, predictions)),
        "mae": float(mean_absolute_error(y_test, predictions)),
    }

    with MODEL_PATH.open("wb") as model_file:
        pickle.dump(model, model_file, protocol=pickle.HIGHEST_PROTOCOL)

    with SCALER_PATH.open("wb") as scaler_file:
        pickle.dump(scaler, scaler_file, protocol=pickle.HIGHEST_PROTOCOL)

    return metrics


if __name__ == "__main__":
    result = train()
    print("═" * 55)
    print("  South India biomass model retraining complete.")
    print("═" * 55)
    print(f"  Rows used      : {result['rows_used']}")
    print(f"  Feature order   : {', '.join(result['features'])}")
    print(f"  Validation R²   : {result['r2']:.4f}")
    print(f"  Validation MAE  : {result['mae']:.4f}")
    print(f"  Model written   : {MODEL_PATH}")
    print(f"  Scaler written  : {SCALER_PATH}")
    print("═" * 55)
