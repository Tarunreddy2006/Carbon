import hashlib

def generate_credit_certificate(parcel_id: str, year: str, co2e: float) -> str:
    """Generates the SHA-256 unique tracking code for a credit."""
    raw_string = f"{parcel_id}-{year}-{co2e}-PHASE1_SALT"
    hash_obj = hashlib.sha256(raw_string.encode('utf-8'))
    short_hash = hash_obj.hexdigest()[:8].upper()
    return f"IND-{short_hash}-{year}"

"""
services/ledger.py
─────────────────────────────────────────────────────────────────────────────
Cryptographic engine. Generates unique certificates and SHA-256 fingerprints
to guarantee carbon data is tamper-proof.
─────────────────────────────────────────────────────────────────────────────
"""
import json
import uuid

def generate_cryptographic_proof(parcel_id: str, vintage_year: str, co2e: float, geojson_geom: dict, ndvi_mean: float) -> tuple[str, str, str]:
    """
    Generates a Certificate ID, a SHA-256 hash, and the raw JSON payload.
    """
    # 1. Generate human-readable Certificate ID
    cert_id = f"IND-{str(uuid.uuid4())[:8].upper()}-{vintage_year}"

    # 2. Create the immutable payload dictionary
    payload = {
        "parcel_id": parcel_id,
        "vintage_year": vintage_year,
        "co2_equivalent_tons": round(co2e, 2),
        "ndvi_mean": round(ndvi_mean, 3),
        "geometry": geojson_geom
    }

    # 3. Convert to a deterministic JSON string (sort_keys=True is CRITICAL)
    payload_str = json.dumps(payload, sort_keys=True,separators=(',', ':'))

    # 4. Generate the SHA-256 Fingerprint
    data_hash = hashlib.sha256(payload_str.encode('utf-8')).hexdigest()

    return cert_id, data_hash, payload_str