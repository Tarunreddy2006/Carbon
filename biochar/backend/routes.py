"""
carbon/biochar/backend/routes.py
──────────────────────────────────────────────────────────────────────────────
REST API endpoints for the biochar carbon-removal pipeline.
──────────────────────────────────────────────────────────────────────────────
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import List
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status, Form, File, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from carbon.biochar.backend.database import get_db
from carbon.biochar.backend.models import (
    BatchStatus,
    BiocharBatch,
    DistributionSink,
    LabAssay,
    PyrolysisTelemetry,
    VerificationTier,
)
from carbon.biochar.backend.validation import (
    calculate_net_sequestration,
    evaluate_chemical_permanence,
    validate_thermal_stability,
    check_batch_delivery_completion,
)
from carbon.biochar.backend.attestation import (
    verify_attestation_token,
    AttestationTokenExpiredError,
    AttestationTokenInvalidError,
)
from carbon.biochar.backend.audit import compile_verification_dossier
import os
import uuid

logger = logging.getLogger("carbon_engine")

router = APIRouter(prefix="/api/v1/biochar", tags=["Biochar Pipeline"])


# ─── Pydantic Request/Response Schemas ────────────────────────────────────────

class TelemetryItem(BaseModel):
    batch_id: str = Field(..., description="ID of the biochar batch")
    timestamp: datetime = Field(..., description="Sensor reading timestamp (UTC)")
    kiln_temperature_celsius: float = Field(..., ge=-273.15, description="Kiln temperature in °C")
    electricity_consumption_kwh: float = Field(..., ge=0.0, description="Electricity consumption in kWh")
    fossil_fuel_consumption_liters: float = Field(..., ge=0.0, description="Fossil fuel consumption in liters")


class TelemetryStreamResponse(BaseModel):
    status: str = "success"
    message: str
    records_inserted: int
    batch_ids: List[str]


class LabSubmitRequest(BaseModel):
    batch_id: str = Field(..., description="ID of the biochar batch")
    organic_carbon_percentage: float = Field(..., ge=0.0, le=100.0, description="Organic carbon fraction (0-100%)")
    molar_hc_ratio: float = Field(..., ge=0.0, description="Molar hydrogen-to-carbon ratio (H:C)")
    certificate_hash: str = Field(..., description="SHA-256 certificate hash of the lab document")


class LabSubmitResponse(BaseModel):
    status: str = "success"
    message: str
    batch_id: str
    verification_tier: str
    batch_status: str


class SequestrationResponse(BaseModel):
    status: str = "success"
    batch_id: str
    net_sequestration_tco2e: float


class PublicAttestResponse(BaseModel):
    status: str = "success"
    message: str
    sink_id: str
    photo_evidence_url: str


class PublicSinkDetailsResponse(BaseModel):
    producer_name: str
    delivery_ticket_id: str
    shipped_mass_tons: float
    already_attested: bool
    sink_id: str
    photo_evidence_url: str


# ─── Helper Functions ─────────────────────────────────────────────────────────

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "..", "static", "evidence", "sinks")

def save_evidence_image(file_data: bytes, filename: str) -> str:
    # Check for GCS configuration
    bucket_name = os.getenv("BIOCHAR_STORAGE_BUCKET")
    if bucket_name:
        try:
            from google.cloud import storage
            client = storage.Client()
            bucket = client.bucket(bucket_name)
            blob_name = f"evidence/sinks/{uuid.uuid4()}_{filename}"
            blob = bucket.blob(blob_name)
            blob.upload_from_string(file_data, content_type="image/jpeg")
            return f"https://storage.googleapis.com/{bucket_name}/{blob_name}"
        except Exception as exc:
            logger.error("Failed to upload to Google Cloud Storage: %s. Falling back to local storage.", exc)

    # Fallback to Local storage
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    unique_filename = f"{uuid.uuid4()}_{filename}"
    file_path = os.path.join(UPLOAD_DIR, unique_filename)
    with open(file_path, "wb") as f:
        f.write(file_data)
    # Return absolute URL
    return f"https://biochar.stomata.tech/evidence/sinks/{unique_filename}"


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.post("/telemetry/stream", response_model=TelemetryStreamResponse, status_code=status.HTTP_201_CREATED)
async def stream_telemetry(
    payload: List[TelemetryItem],
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
) -> TelemetryStreamResponse:
    """
    Stream and batch insert high-frequency SCADA/PLC pyrolysis telemetry.
    Triggers background thermal stability validation for all updated batches.
    """
    logger.info("Received telemetry stream with %d items.", len(payload))
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Payload array cannot be empty."
        )

    try:
        # Extract unique batch IDs to validate afterwards
        unique_batch_ids = list({item.batch_id for item in payload})

        # Verify that batches exist
        existing_batches = {
            b.id for b in db.query(BiocharBatch.id).filter(BiocharBatch.id.in_(unique_batch_ids)).all()
        }
        missing_batches = set(unique_batch_ids) - existing_batches
        if missing_batches:
            logger.warning("Telemetry stream contains unrecognized batch IDs: %s", missing_batches)
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Unrecognized batch IDs found: {list(missing_batches)}"
            )

        # Batch insert
        db_telemetry_records = [
            PyrolysisTelemetry(
                batch_id=item.batch_id,
                timestamp=item.timestamp,
                kiln_temperature_celsius=item.kiln_temperature_celsius,
                electricity_consumption_kwh=item.electricity_consumption_kwh,
                fossil_fuel_consumption_liters=item.fossil_fuel_consumption_liters
            )
            for item in payload
        ]

        db.add_all(db_telemetry_records)
        db.commit()

        # Trigger thermal stability check asynchronously for each unique batch
        for batch_id in unique_batch_ids:
            background_tasks.add_task(validate_thermal_stability, batch_id)

        return TelemetryStreamResponse(
            message="Telemetry records successfully inserted and validation scheduled.",
            records_inserted=len(payload),
            batch_ids=unique_batch_ids
        )

    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Failed to process telemetry stream: %s", exc, exc_info=True)
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to save telemetry records: {exc}"
        )


@router.post("/lab/submit", response_model=LabSubmitResponse, status_code=status.HTTP_200_OK)
async def submit_lab_assay(
    payload: LabSubmitRequest,
    db: Session = Depends(get_db)
) -> LabSubmitResponse:
    """
    Insert or overwrite laboratory analysis assay results for a biochar batch.
    Triggers immediate chemical permanence classification and status updates.
    """
    logger.info("Received LabAssay submission for batch: %s", payload.batch_id)

    try:
        # Check if the batch exists
        batch = db.query(BiocharBatch).filter(BiocharBatch.id == payload.batch_id).first()
        if not batch:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"BiocharBatch with ID {payload.batch_id} does not exist."
            )

        # Insert or overwrite LabAssay
        assay = db.query(LabAssay).filter(LabAssay.batch_id == payload.batch_id).first()
        if assay:
            logger.info("Overwriting existing LabAssay for batch %s.", payload.batch_id)
            assay.organic_carbon_percentage = payload.organic_carbon_percentage
            assay.molar_hc_ratio = payload.molar_hc_ratio
            assay.certificate_hash = payload.certificate_hash
            assay.uploaded_at = datetime.now(timezone.utc)
        else:
            logger.info("Inserting new LabAssay for batch %s.", payload.batch_id)
            assay = LabAssay(
                batch_id=payload.batch_id,
                organic_carbon_percentage=payload.organic_carbon_percentage,
                molar_hc_ratio=payload.molar_hc_ratio,
                certificate_hash=payload.certificate_hash,
                verification_tier=VerificationTier.pending
            )
            db.add(assay)

        db.commit()

        # Immediately trigger chemical permanence evaluation
        tier = evaluate_chemical_permanence(payload.batch_id, db=db)

        # Refresh objects to get updated statuses
        db.refresh(batch)

        return LabSubmitResponse(
            message="Lab assay processed and chemical permanence evaluated.",
            batch_id=payload.batch_id,
            verification_tier=tier,
            batch_status=batch.status.value
        )

    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Failed to process lab submission for batch %s: %s", payload.batch_id, exc, exc_info=True)
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to process lab submission: {exc}"
        )


@router.post("/{batch_id}/sequestration", response_model=SequestrationResponse, status_code=status.HTTP_200_OK)
async def run_sequestration_calculation(
    batch_id: str,
    db: Session = Depends(get_db)
) -> SequestrationResponse:
    """
    Exposes the sequestration calculation engine. Calculates Net CO2e,
    saves it to the database, and returns the result.
    """
    try:
        # Check if the batch exists
        batch = db.query(BiocharBatch).filter(BiocharBatch.id == batch_id).first()
        if not batch:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"BiocharBatch with ID {batch_id} does not exist."
            )

        net_val = calculate_net_sequestration(batch_id, db=db)

        return SequestrationResponse(
            batch_id=batch_id,
            net_sequestration_tco2e=net_val
        )

    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Failed to calculate sequestration for batch %s: %s", batch_id, exc, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Sequestration calculation failed: {exc}"
        )


@router.get("/public/sink-details", response_model=PublicSinkDetailsResponse, status_code=status.HTTP_200_OK)
async def get_public_sink_details(
    token: str,
    db: Session = Depends(get_db)
) -> PublicSinkDetailsResponse:
    """
    Public endpoint to fetch non-sensitive shipment information for validation
    prior to attestation form submission.
    """
    try:
        sink_id = verify_attestation_token(token)
    except AttestationTokenExpiredError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except AttestationTokenInvalidError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Token verification failed: {exc}")

    sink = db.query(DistributionSink).filter(DistributionSink.id == sink_id).first()
    if not sink:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Distribution sink record not found.")

    # Get producer name from batch -> project
    producer_name = "Green Biochar Producer"
    if sink.batch and sink.batch.project:
        producer_name = sink.batch.project.name

    return PublicSinkDetailsResponse(
        producer_name=producer_name,
        delivery_ticket_id=sink.delivery_ticket_id,
        shipped_mass_tons=sink.shipped_mass_tons,
        already_attested=sink.attestation_timestamp is not None,
        sink_id=sink.id,
        photo_evidence_url=sink.photo_evidence_url or ""
    )


@router.post("/public/attest", response_model=PublicAttestResponse, status_code=status.HTTP_200_OK)
async def public_attest_delivery(
    background_tasks: BackgroundTasks,
    token: str = Form(..., description="Farmer attestation JWT token"),
    latitude: float = Form(..., description="Sink GPS latitude"),
    longitude: float = Form(..., description="Sink GPS longitude"),
    evidence_file: UploadFile = File(..., description="Attestation photo evidence"),
    db: Session = Depends(get_db)
) -> PublicAttestResponse:
    """
    Public attestation endpoint for farmers to geotag and submit photo evidence.
    No authentication is required; access is validated via cryptographic tokens.
    """
    logger.info("Received public attestation request.")

    # 1. Size limit validation
    MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB
    file_bytes = await evidence_file.read(MAX_FILE_SIZE + 1)
    if len(file_bytes) > MAX_FILE_SIZE:
        logger.warning("Upload rejected: file size exceeds 10MB limit.")
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="The uploaded evidence file exceeds the maximum allowed size of 10MB."
        )

    # 2. Upload type validation
    allowed_content_types = ["image/jpeg", "image/png", "image/gif", "image/webp"]
    if evidence_file.content_type not in allowed_content_types:
        logger.warning("Upload rejected: invalid content type %s.", evidence_file.content_type)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid file type. Only JPEG, PNG, GIF, and WEBP images are allowed."
        )

    # 3. Token verification
    try:
        sink_id = verify_attestation_token(token)
    except AttestationTokenExpiredError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except AttestationTokenInvalidError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Token verification failed: {exc}")

    # 4. Query DistributionSink
    sink = db.query(DistributionSink).filter(DistributionSink.id == sink_id).first()
    if not sink:
        logger.error("DistributionSink %s not found for attestation.", sink_id)
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Distribution sink record not found."
        )

    # Duplicate check
    if sink.attestation_timestamp is not None:
        logger.warning("Attestation already submitted for sink %s.", sink_id)
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Attestation has already been submitted for this delivery."
        )

    # 5. Upload file and get URL
    try:
        filename = evidence_file.filename or "evidence.jpg"
        photo_url = save_evidence_image(file_bytes, filename)
    except Exception as exc:
        logger.error("Failed to store evidence image: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to store evidence image."
        )

    # 6. Update DistributionSink
    try:
        sink.sink_latitude = latitude
        sink.sink_longitude = longitude
        sink.photo_evidence_url = photo_url
        sink.attestation_timestamp = datetime.now(timezone.utc)
        db.commit()
        logger.info("Successfully updated DistributionSink %s.", sink_id)
    except Exception as exc:
        db.rollback()
        logger.error("Failed to update DistributionSink %s: %s", sink_id, exc, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update database record."
        )

    # 7. Check batch delivery completion in background
    background_tasks.add_task(check_batch_delivery_completion, sink.batch_id)

    return PublicAttestResponse(
        message="Attestation successfully submitted and verified.",
        sink_id=sink_id,
        photo_evidence_url=photo_url
    )


@router.get("/{batch_id}/dossier", status_code=status.HTTP_200_OK)
async def get_audit_dossier(
    batch_id: str,
    db: Session = Depends(get_db)
):
    """
    Retrieve the compiled cryptographic audit dossier for a given batch.
    """
    try:
        dossier = compile_verification_dossier(batch_id, db=db)
        return dossier
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except Exception as exc:
        logger.error("Failed to compile audit dossier for batch %s: %s", batch_id, exc, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to compile verification dossier: {exc}"
        )
