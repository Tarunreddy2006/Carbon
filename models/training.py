import pandas as pd

df = pd.read_csv("Carbon_SouthIndia_Final_Training.csv")

print(
    df[["VV", "VH", "VV_VH_ratio"]]
    .head(10)
)