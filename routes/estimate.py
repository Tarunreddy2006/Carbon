"""
routes/estimate.py
─────────────────────────────────────────────────────────────────────────────
The main bridge between the GEE engine and the UI.
Orchestrates validation, anti-fraud checks, historical analysis, and metric generation.
─────────────────────────────────────────────────────────────────────────────
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func
from starlette.concurrency import run_in_threadpool

# Database & Models
from database.db import get_db
from database.models import ParcelRecord, CarbonCredit
from models.parcel import CarbonEstimateResponse, DynamicParcelRequest
from database.models import ParcelRecord, CarbonCredit, CreditStatus

# Services & Logic
from services.service import analyse_parcel, get_historical_ndvi
from services.ledger import generate_cryptographic_proof
from services.validation import validate_and_clean_geometry
from utils.logic import run_carbon_pipeline, calculate_confidence_score
from services.ledger import generate_credit_certificate
from services.auth import get_current_user

from tasks import async_estimate_carbon_draw
from celery.result import AsyncResult
from fastapi.responses import JSONResponse

logger = logging.getLogger("carbon_engine")
router = APIRouter(tags=["Estimation Engine"])

@router.get("/health", status_code=status.HTTP_200_OK)
async def health():
    return {"status": "ok", "service": "estimate-carbon"}

@router.post("/estimate-carbon/draw")
async def estimate_carbon_draw(payload: DynamicParcelRequest, user_token: dict = Depends(get_current_user)):
    user_id = user_token.get("sub")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User ID missing from token")

    if user_token.get("role") != "institution":
        logger.warning(f"SECURITY INCIDENT: User {user_id} attempted unauthorized minting.")
        raise HTTPException(status_code=403, detail="Only Institutional Auditors can mint carbon credits.")
    
    logger.info(f"▶ Offloading Parcel Registration to Celery ({payload.farm_id})")
    
    # 1. Dispatch payload to background worker
    payload_dict = {
        "farm_id": payload.farm_id,
        "source_type": payload.source_type,
        "coordinates": payload.coordinates,
        "user_id": user_id,
        "tree_species": getattr(payload, "tree_species", None)
    }
    
    task = async_estimate_carbon_draw.delay(payload_dict, user_token.get("role"))
    
    # 2. Immediately return a 202 Accepted with the task_id
    return JSONResponse(
        status_code=status.HTTP_202_ACCEPTED,
        content={"task_id": task.id, "status": "processing"}
    )

@router.get("/estimate-carbon/status/{task_id}")
async def get_estimate_status(task_id: str, user_token: dict = Depends(get_current_user)):
    if user_token.get("role") != "institution":
        raise HTTPException(status_code=403, detail="Only Institutional Auditors can view statuses.")
        
    task_result = AsyncResult(task_id)
    
    if task_result.state == 'PENDING' or task_result.state == 'STARTED':
        return {"status": "processing"}
    elif task_result.state == 'SUCCESS':
        return {"status": "completed", "result": task_result.result}
    elif task_result.state == 'FAILURE':
        error_msg = str(task_result.info)
        try:
            import json
            error_json = json.loads(error_msg)
            return JSONResponse(
                status_code=status.HTTP_409_CONFLICT,
                content={"status": "failed", "detail": error_json}
            )
        except Exception:
            return JSONResponse(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                content={"status": "failed", "detail": error_msg}
            )
    else:
        return {"status": task_result.state}