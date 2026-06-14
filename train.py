import ee

# =====================================================

# CONFIG

# =====================================================

PROJECT_ID = "detrixai"

STATE_NAME = "Gujarat"

EXPORT_NAME = f"Carbon_{STATE_NAME}_Biomass"

NUM_PIXELS = 15000

# =====================================================

# AUTH

# =====================================================

try:
   ee.Initialize(project=PROJECT_ID)
except:
   ee.Authenticate()
ee.Initialize(project=PROJECT_ID)

print("Connected to Earth Engine")

# =====================================================

# STATE

# =====================================================

states = ee.FeatureCollection("FAO/GAUL/2015/level1")

state = states.filter(
ee.Filter.eq("ADM1_NAME", STATE_NAME)
)

print("Processing:", STATE_NAME)

# =====================================================

# GEDI

# =====================================================

agbd = (
ee.ImageCollection("LARSE/GEDI/GEDI04_A_002_MONTHLY")
.select("agbd")
.median()
)

rh95 = (
ee.ImageCollection("LARSE/GEDI/GEDI02_A_002_MONTHLY")
.select("rh95")
.median()
)

# =====================================================

# SENTINEL-2

# =====================================================

s2 = (
ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
.filterBounds(state)
.filterDate("2022-01-01", "2022-12-31")
.filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 20))
.median()
)

ndvi = (
s2.normalizedDifference(["B8", "B4"])
.rename("NDVI")
)

ndmi = (
s2.normalizedDifference(["B8A", "B11"])
.rename("NDMI")
)

evi = s2.expression(
"2.5*((nir-red)/(nir+6*red-7.5*blue+1))",
{
"nir": s2.select("B8"),
"red": s2.select("B4"),
"blue": s2.select("B2")
}
).rename("EVI")

# =====================================================

# SENTINEL-1

# =====================================================

s1 = (
ee.ImageCollection("COPERNICUS/S1_GRD")
.filterBounds(state)
.filterDate("2022-01-01", "2022-12-31")
.filter(
ee.Filter.listContains(
"transmitterReceiverPolarisation",
"VV"
)
)
.filter(
ee.Filter.listContains(
"transmitterReceiverPolarisation",
"VH"
)
)
.median()
)

vv = s1.select("VV").rename("VV")
vh = s1.select("VH").rename("VH")

vv_vh_ratio = (
vv.divide(vh.abs())
.rename("VV_VH_ratio")
)

# =====================================================

# TERRAIN

# =====================================================

srtm = ee.Image("USGS/SRTMGL1_003")

elevation = (
srtm.select("elevation")
.rename("elevation")
)

slope = (
ee.Terrain.slope(srtm)
.rename("slope")
)

# =====================================================

# FEATURE STACK

# =====================================================

stack = ee.Image.cat([
agbd.rename("agbd"),
rh95.rename("rh95"),
ndvi,
ndmi,
evi,
vv,
vh,
vv_vh_ratio,
elevation,
slope
])

# =====================================================

# SAMPLE

# =====================================================

samples = (
stack
.sample(
region=state.geometry(),
scale=25,
numPixels=NUM_PIXELS,
seed=42,
geometries=False
)
)

# =====================================================

# EXPORT

# =====================================================

task = ee.batch.Export.table.toDrive(
collection=samples,
description=EXPORT_NAME,
folder="EarthEngine",
fileFormat="CSV"
)

task.start()

print("Export Started:", EXPORT_NAME)
