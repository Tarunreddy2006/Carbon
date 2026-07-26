FROM python:3.11-slim

WORKDIR /app

# Install critical OS-level C-libraries required by XGBoost, GeoAlchemy, and rasterio (GDAL)
RUN apt-get update && apt-get install -y \
    libgomp1 \
    g++ \
    gcc \
    gdal-bin \
    libgdal-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .

RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# THE FIX: Force C-level threading libraries to share CPU resources
ENV KMP_DUPLICATE_LIB_OK=TRUE
ENV OMP_NUM_THREADS=1

# Parameterized app module — override via docker-compose or env var
# Defaults to ARR app; set to biochar.app:app or landing.app:app as needed
ENV APP_MODULE=ARR.carbon:app

EXPOSE 8000

CMD uvicorn ${APP_MODULE} --host 0.0.0.0 --port 8000
