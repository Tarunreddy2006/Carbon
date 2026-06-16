import joblib

s = joblib.load("CarbonEstimator.pkl")

print(s.n_features_in_)