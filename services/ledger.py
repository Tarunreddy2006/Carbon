import hashlib

def generate_credit_certificate(parcel_id: str, year: str, co2e: float) -> str:
    """Generates the SHA-256 unique tracking code for a credit."""
    raw_string = f"{parcel_id}-{year}-{co2e}-PHASE1_SALT"
    hash_obj = hashlib.sha256(raw_string.encode('utf-8'))
    short_hash = hash_obj.hexdigest()[:8].upper()
    return f"IND-{short_hash}-{year}"