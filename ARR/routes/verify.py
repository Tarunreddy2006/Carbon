"""
routes/verify.py
─────────────────────────────────────────────────────────────────────────────
Public Transparency Portal. Allows anyone to cryptographically verify 
that a carbon credit has not been altered since it was minted.
─────────────────────────────────────────────────────────────────────────────
"""
import hashlib
import json
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from ARR.database.db import get_db
from ARR.database.models import CarbonCredit

router = APIRouter(tags=["Transparency & Audit"])

@router.get("/verify-certificate/{certificate_id}")
async def verify_certificate(certificate_id: str, db: Session = Depends(get_db)):
    # 1. Fetch the credit from the database
    credit = db.query(CarbonCredit).filter(CarbonCredit.unique_code == certificate_id).first()
    
    if not credit:
        raise HTTPException(status_code=404, detail="Certificate not found in registry.")

    # 2. Extract the data currently in the database
    current_payload_dict = credit.raw_payload
    stored_hash = credit.data_hash

    # 3. Recalculate the hash LIVE using the payload
    reconstructed_str = json.dumps(current_payload_dict, sort_keys=True, separators=(',', ':'))
    live_recalculated_hash = hashlib.sha256(reconstructed_str.encode('utf-8')).hexdigest()
    # 4. Check for tampering
    is_mathematically_valid = (live_recalculated_hash == stored_hash)

    return {
        "certificate_id": credit.unique_code,
        # Convert Enum to string for the JSON response
        "status": credit.status.name if hasattr(credit.status, 'name') else credit.status, 
        "tamper_check_passed": is_mathematically_valid,
        "cryptographic_proof": {
            "stored_fingerprint": stored_hash,
            "live_calculated_fingerprint": live_recalculated_hash,
            "algorithm": "SHA-256"
        },
        "asset_data": current_payload_dict
    }