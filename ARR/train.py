import pandas as pd

df = pd.read_csv("projects/araku/combined.csv")

print(df["agbd"].describe())
print(df["rh95"].describe())