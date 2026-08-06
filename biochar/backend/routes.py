"""
carbon/biochar/backend/routes.py
──────────────────────────────────────────────────────────────────────────────
REST API endpoints for the biochar carbon-removal pipeline.
──────────────────────────────────────────────────────────────────────────────
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status, Form, File, UploadFile
from fastapi.responses import JSONResponse, FileResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_, func

from PIL import Image
import io
import hashlib

from biochar.backend.database import get_db
from biochar.backend.models import (
    BatchStatus,
    FeedstockBatch,
    BiocharBatch,
    BiocharApplication,
    BiocharSample,
    LaboratoryTest,
    LaboratoryResult,
    LaboratoryCertificate,
    ReactorSensorLog,
    PyrolysisRun,
    Shipment,
    VerificationTier,
    Evidence,
    EvidenceFile,
    EvidenceReview,
    EvidenceAIResult,
    EvidenceAuditLog,
    MassBalanceConfig,
    MassBalanceAnomaly,
)
from biochar.backend.mass_balance import MassBalanceService

from biochar.backend.validation import (
    calculate_net_sequestration,
    evaluate_chemical_permanence,
    validate_thermal_stability,
    check_batch_delivery_completion,
)
from biochar.backend.attestation import (
    verify_attestation_token,
    AttestationTokenExpiredError,
    AttestationTokenInvalidError,
)
from biochar.backend.audit import compile_verification_dossier
import os
import uuid
from biochar.backend.storage import get_storage_provider
from biochar.backend.models import OrganizationMember, Role, Organization, Project

logger = logging.getLogger("carbon_engine")

router = APIRouter(prefix="/api/v1/biochar", tags=["Biochar Pipeline"])


# ─── Storage Request/Response Schemas ─────────────────────────────────────────

class UploadUrlRequest(BaseModel):
    filename: str
    mime_type: str
    file_size: int
    organization_id: str
    project_id: Optional[str] = None
    entity_type: str
    entity_id: str
    activity: str
    uploaded_by: str
    uploaded_by_role: Optional[str] = None

class ConfirmUploadRequest(BaseModel):
    evidence_id: str
    sha256_hash: str

class PublicUploadUrlRequest(BaseModel):
    token: str
    filename: str
    mime_type: str
    file_size: int


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
    return f"https://biochar.stomata.tech/evidence/sinks/{unique_filename}"


def validate_user_org_rbac(db: Session, user_id: str, organization_id: str, required_roles: Optional[List[str]] = None):
    try:
        user_uuid = uuid.UUID(user_id)
        org_uuid = uuid.UUID(organization_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid user_id or organization_id format")

    org = db.query(Organization).filter(Organization.id == org_uuid).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    member = db.query(OrganizationMember).filter(
        OrganizationMember.organization_id == org_uuid,
        OrganizationMember.user_id == user_uuid,
        OrganizationMember.status == "Active"
    ).first()

    if not member:
        raise HTTPException(status_code=403, detail="Access denied. User is not an active member of this organization.")

    if required_roles:
        role = db.query(Role).filter(Role.id == member.role_id).first()
        if not role or role.name not in required_roles:
            raise HTTPException(status_code=403, detail="Access denied. User does not have the required role.")


def validate_file_metadata(mime_type: str, file_size: int):
    # Allowed mime types
    allowed_mimes = [
        "image/jpeg", "image/png", "image/gif", "image/webp",
        "application/pdf", "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "text/plain", "text/csv", "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    ]
    if mime_type not in allowed_mimes:
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {mime_type}")

    # Maximum file size: 100MB
    MAX_SIZE = 100 * 1024 * 1024
    if file_size > MAX_SIZE:
        raise HTTPException(status_code=400, detail=f"File exceeds maximum allowed size of 100MB")


def get_storage_folder(activity: str, entity_type: str) -> str:
    # Map activity/entity_type to folder
    act = (activity or "").lower()
    ent = (entity_type or "").lower()
    
    if "feedstock" in act or "feedstock" in ent:
        return "feedstock"
    if "pyrolysis" in act or "pyrolysis" in ent:
        return "pyrolysis"
    if "batch" in act or "batch" in ent or "biochar" in act:
        return "biochar"
    if "laboratory" in act or "laboratory" in ent or "test" in ent or "sample" in ent or "cert" in ent:
        return "laboratory"
    if "storage" in act or "storage" in ent:
        return "storage"
    if "distribution" in act or "distribution" in ent or "attest" in act or "sink" in ent:
        return "distribution"
    if "monitoring" in act or "monitoring" in ent:
        return "monitoring"
    if "report" in act or "report" in ent:
        return "reports"
    if "export" in act or "export" in ent:
        return "exports"
        
    return "evidence"


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
        unique_batch_ids = list({item.batch_id for item in payload})

        existing_batches = {
            str(b.id) for b in db.query(BiocharBatch.id).filter(BiocharBatch.id.in_(unique_batch_ids)).all()
        }
        missing_batches = set(unique_batch_ids) - existing_batches
        if missing_batches:
            logger.warning("Telemetry stream contains unrecognized batch IDs: %s", missing_batches)
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Unrecognized batch IDs found: {list(missing_batches)}"
            )

        db_telemetry_records = []
        for item in payload:
            batch = db.query(BiocharBatch).filter(BiocharBatch.id == item.batch_id).first()
            if not batch or not batch.pyrolysis_run_id:
                continue

            run = db.query(PyrolysisRun).filter(PyrolysisRun.id == batch.pyrolysis_run_id).first()
            if run:
                run.electricity_kwh = item.electricity_consumption_kwh
                run.fuel_used_liters = item.fossil_fuel_consumption_liters

            log = ReactorSensorLog(
                pyrolysis_run_id=batch.pyrolysis_run_id,
                sensor_name='kiln_temperature',
                sensor_value=item.kiln_temperature_celsius,
                recorded_at=item.timestamp
            )
            db_telemetry_records.append(log)

        db.add_all(db_telemetry_records)
        db.commit()

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

        # 1. Ensure BiocharSample exists
        sample = db.query(BiocharSample).filter(BiocharSample.biochar_batch_id == payload.batch_id).first()
        if not sample:
            sample = BiocharSample(
                biochar_batch_id=payload.batch_id,
                sample_code=f"SMP-{uuid.uuid4().hex[:8].upper()}",
                collection_date=datetime.now(timezone.utc).date()
            )
            db.add(sample)
            db.flush()

        # 2. Ensure LaboratoryTest exists
        test = db.query(LaboratoryTest).filter(LaboratoryTest.sample_id == sample.id).first()
        if not test:
            test = LaboratoryTest(
                sample_id=sample.id,
                test_date=datetime.now(timezone.utc).date(),
                status='Completed'
            )
            db.add(test)
            db.flush()

        # 3. Ensure LaboratoryCertificate exists
        cert = db.query(LaboratoryCertificate).filter(LaboratoryCertificate.laboratory_test_id == test.id).first()
        if not cert:
            cert = LaboratoryCertificate(
                laboratory_test_id=test.id,
                certificate_number=payload.certificate_hash,
                certificate_url=f"https://biochar.stomata.tech/evidence/lab/{payload.certificate_hash[:10]}",
                issue_date=datetime.now(timezone.utc).date()
            )
            db.add(cert)
        else:
            cert.certificate_number = payload.certificate_hash
            cert.certificate_url = f"https://biochar.stomata.tech/evidence/lab/{payload.certificate_hash[:10]}"
            cert.issue_date = datetime.now(timezone.utc).date()

        # 4. Insert or update Results in laboratory_results linked via parameter_id
        # Organic Carbon parameter_id: '7af73dff-26e6-4c98-abee-251cb4261c62'
        oc_res = db.query(LaboratoryResult).filter(
            LaboratoryResult.laboratory_test_id == test.id,
            LaboratoryResult.parameter_id == '7af73dff-26e6-4c98-abee-251cb4261c62'
        ).first()
        if not oc_res:
            oc_res = LaboratoryResult(
                laboratory_test_id=test.id,
                parameter_id='7af73dff-26e6-4c98-abee-251cb4261c62',
                measured_value=payload.organic_carbon_percentage,
                pass_=True
            )
            db.add(oc_res)
        else:
            oc_res.measured_value = payload.organic_carbon_percentage

        # H/C Ratio parameter_id: 'ed868532-af4e-4f76-a13b-aca871694df1'
        hc_res = db.query(LaboratoryResult).filter(
            LaboratoryResult.laboratory_test_id == test.id,
            LaboratoryResult.parameter_id == 'ed868532-af4e-4f76-a13b-aca871694df1'
        ).first()
        if not hc_res:
            hc_res = LaboratoryResult(
                laboratory_test_id=test.id,
                parameter_id='ed868532-af4e-4f76-a13b-aca871694df1',
                measured_value=payload.molar_hc_ratio,
                pass_=(payload.molar_hc_ratio <= 0.7)
            )
            db.add(hc_res)
        else:
            hc_res.measured_value = payload.molar_hc_ratio
            hc_res.pass_ = (payload.molar_hc_ratio <= 0.7)

        db.commit()

        # Immediately trigger chemical permanence evaluation
        tier = evaluate_chemical_permanence(payload.batch_id, db=db)

        # Refresh batch status
        db.refresh(batch)

        return LabSubmitResponse(
            message="Lab assay processed and chemical permanence evaluated.",
            batch_id=payload.batch_id,
            verification_tier=tier,
            batch_status=str(batch.status)
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
    Public endpoint to fetch shipment information for attestation.
    """
    try:
        shipment_id = verify_attestation_token(token)
    except AttestationTokenExpiredError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except AttestationTokenInvalidError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Token verification failed: {exc}")

    shipment = db.query(Shipment).filter(Shipment.id == shipment_id).first()
    if not shipment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Shipment record not found.")

    producer_name = "Green Biochar Producer"
    if shipment.biochar_batch and shipment.biochar_batch.pyrolysis_run:
        run = shipment.biochar_batch.pyrolysis_run
        if run.feedstock_batch and run.feedstock_batch.project:
            producer_name = run.feedstock_batch.project.name

    # Retrieve photo evidence from application details if already submitted
    photo_url = ""
    app = db.query(BiocharApplication).filter(BiocharApplication.biochar_batch_id == shipment.biochar_batch_id).first()
    if app:
        photo_url = app.remarks or ""

    return PublicSinkDetailsResponse(
        producer_name=producer_name,
        delivery_ticket_id=shipment.shipment_number or "",
        shipped_mass_tons=float((shipment.shipped_weight_kg or 0.0) / 1000.0),
        already_attested=shipment.status == 'delivered',
        sink_id=str(shipment.id),
        photo_evidence_url=photo_url
    )


@router.post("/public/attest", response_model=PublicAttestResponse, status_code=status.HTTP_200_OK)
async def public_attest_delivery(
    background_tasks: BackgroundTasks,
    token: str = Form(..., description="Farmer attestation JWT token"),
    latitude: float = Form(..., description="Sink GPS latitude"),
    longitude: float = Form(..., description="Sink GPS longitude"),
    evidence_file: Optional[UploadFile] = File(None, description="Attestation photo evidence"),
    object_key: Optional[str] = Form(None, description="Cloudflare R2 object key"),
    filename: Optional[str] = Form(None, description="Original filename"),
    mime_type: Optional[str] = Form(None, description="MIME type of file"),
    file_size: Optional[int] = Form(None, description="Size of file in bytes"),
    sha256_hash: Optional[str] = Form(None, description="SHA-256 hash of file"),
    db: Session = Depends(get_db)
) -> PublicAttestResponse:
    """
    Public attestation endpoint for farmers to geotag and submit photo evidence.
    Supports either direct browser upload to R2 (with object_key) or multi-part fallback.
    """
    logger.info("Received public attestation request.")

    # 1. Token verification
    try:
        shipment_id = verify_attestation_token(token)
    except AttestationTokenExpiredError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except AttestationTokenInvalidError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Token verification failed: {exc}")

    # 2. Query Shipment
    shipment = db.query(Shipment).filter(Shipment.id == shipment_id).first()
    if not shipment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Shipment record not found."
        )

    # Duplicate check
    if shipment.status == 'delivered':
        logger.warning("Attestation already submitted for shipment %s.", shipment_id)
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Attestation has already been submitted for this delivery."
        )

    photo_url = None
    
    # 3. Store file based on upload workflow
    if object_key:
        # --- Direct Client R2 Upload Flow ---
        try:
            storage_provider = get_storage_provider()
            is_verified = storage_provider.verify_upload(object_key, file_size or 0)
        except Exception as e:
            logger.error("Error verifying storage object %s: %s", object_key, e)
            is_verified = False

        if not is_verified:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="File upload verification failed. File not found in R2 or size mismatch."
            )

        # Update or create Evidence metadata record
        evidence_record = db.query(Evidence).filter(
            Evidence.object_key == object_key,
            Evidence.upload_status == "Pending"
        ).first()

        if not evidence_record:
            # Resolve org/project context
            org_id = None
            project_id = None
            if shipment.biochar_batch:
                batch = shipment.biochar_batch
                if batch.pyrolysis_run and batch.pyrolysis_run.feedstock_batch:
                    feedstock = batch.pyrolysis_run.feedstock_batch
                    if feedstock.project:
                        project_id = feedstock.project.id
                        org_id = feedstock.project.organization_id

            if not org_id:
                raise HTTPException(status_code=400, detail="Could not resolve organization for this shipment.")

            evidence_record = Evidence(
                organization_id=org_id,
                project_id=project_id,
                entity_type="distribution",
                entity_id=uuid.UUID(shipment_id),
                activity="distribution",
                uploaded_by=None,
                uploaded_by_role="Farmer",
                capture_timestamp=datetime.now(timezone.utc),
                media_type="image" if (mime_type or "").startswith("image/") else "document",
                filename=os.path.basename(object_key),
                original_filename=filename or "evidence.jpg",
                storage_path=object_key,
                file_size=file_size,
                mime_type=mime_type,
                bucket_name=storage_provider.bucket_name,
                object_key=object_key,
                storage_provider="cloudflare_r2",
                upload_status="Completed",
                verification_status="Uploaded",
                sha256_hash=sha256_hash,
                uploaded_at=datetime.now(timezone.utc)
            )
            db.add(evidence_record)
            db.flush()
        else:
            evidence_record.upload_status = "Completed"
            evidence_record.verification_status = "Uploaded"
            evidence_record.sha256_hash = sha256_hash
            evidence_record.uploaded_at = datetime.now(timezone.utc)
            evidence_record.updated_at = datetime.now(timezone.utc)
            db.flush()

        # Add backward-compatible EvidenceFile
        evidence_file = EvidenceFile(
            evidence_id=evidence_record.id,
            file_role="original",
            filename=evidence_record.original_filename,
            storage_path=evidence_record.object_key,
            file_size=evidence_record.file_size,
            mime_type=evidence_record.mime_type,
            sha256_hash=sha256_hash
        )
        db.add(evidence_file)

        # Log audit
        audit_log = EvidenceAuditLog(
            evidence_id=evidence_record.id,
            user_id=None,
            action="upload_completed",
            details={
                "filename": evidence_record.original_filename,
                "object_key": object_key,
                "sha256_hash": sha256_hash
            }
        )
        db.add(audit_log)

        # Generate temporary signed URL for immediate display
        photo_url = storage_provider.generate_presigned_download_url(object_key)

    elif evidence_file:
        # --- Legacy Multipart Upload Proxy Flow ---
        # Size limit validation
        MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB
        file_bytes = await evidence_file.read(MAX_FILE_SIZE + 1)
        if len(file_bytes) > MAX_FILE_SIZE:
            logger.warning("Upload rejected: file size exceeds 10MB limit.")
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail="The uploaded evidence file exceeds the maximum allowed size of 10MB."
            )

        # Upload type validation
        allowed_content_types = ["image/jpeg", "image/png", "image/gif", "image/webp"]
        if evidence_file.content_type not in allowed_content_types:
            logger.warning("Upload rejected: invalid content type %s.", evidence_file.content_type)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid file type. Only JPEG, PNG, GIF, and WEBP images are allowed."
            )

        try:
            fname = evidence_file.filename or "evidence.jpg"
            photo_url = save_evidence_image(file_bytes, fname)
        except Exception as exc:
            logger.error("Failed to store evidence image: %s", exc, exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to store evidence image."
            )
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing file upload payload. Either provide an object_key or upload a file directly."
        )

    # 4. Update Shipment and BiocharApplication
    try:
        shipment.status = 'delivered'
        
        # Save application details in biochar_applications
        app = db.query(BiocharApplication).filter(BiocharApplication.biochar_batch_id == shipment.biochar_batch_id).first()
        if not app:
            app = BiocharApplication(
                biochar_batch_id=shipment.biochar_batch_id,
                latitude=latitude,
                longitude=longitude,
                application_site=shipment.shipment_number,
                remarks=photo_url or object_key,
                applied_by=shipment.destination or "Farmer",
                application_date=datetime.now(timezone.utc).date(),
                application_rate_kg_ha=1500.0,
                area_hectares=2.0
            )
            db.add(app)
        else:
            app.latitude = latitude
            app.longitude = longitude
            app.remarks = photo_url or object_key
            app.application_site = shipment.shipment_number
            app.applied_by = shipment.destination or "Farmer"
            app.application_date = datetime.now(timezone.utc).date()

        db.commit()
        logger.info("Successfully updated Shipment %s and BiocharApplication.", shipment_id)
    except Exception as exc:
        db.rollback()
        logger.error("Failed to attest shipment %s: %s", shipment_id, exc, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update database record."
        )

    # 5. Check batch delivery completion in background
    if shipment.biochar_batch_id:
        background_tasks.add_task(check_batch_delivery_completion, str(shipment.biochar_batch_id))

    return PublicAttestResponse(
        message="Attestation successfully submitted and verified.",
        sink_id=str(shipment_id),
        photo_evidence_url=photo_url or ""
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


# ─── Evidence Management System (EMS) REST API Endpoints ────────────────────

EMS_UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "..", "frontend", "evidence", "ems")

def save_evidence_file(file_bytes: bytes, filename: str, file_role: str) -> tuple[str, str]:
    bucket_name = os.getenv("BIOCHAR_STORAGE_BUCKET")
    unique_filename = f"{uuid.uuid4()}_{file_role}_{filename}"
    if bucket_name:
        try:
            from google.cloud import storage
            client = storage.Client()
            bucket = client.bucket(bucket_name)
            blob_name = f"evidence/ems/{unique_filename}"
            blob = bucket.blob(blob_name)
            
            content_type = "application/octet-stream"
            if filename.lower().endswith(('.jpg', '.jpeg')):
                content_type = "image/jpeg"
            elif filename.lower().endswith('.png'):
                content_type = "image/png"
            elif filename.lower().endswith('.pdf'):
                content_type = "application/pdf"
            
            blob.upload_from_string(file_bytes, content_type=content_type)
            gcs_url = f"https://storage.googleapis.com/{bucket_name}/{blob_name}"
            return blob_name, gcs_url
        except Exception as exc:
            logger.error("Failed to upload to Google Cloud Storage: %s. Falling back to local.", exc)

    # Local fallback
    os.makedirs(EMS_UPLOAD_DIR, exist_ok=True)
    file_path = os.path.join(EMS_UPLOAD_DIR, unique_filename)
    with open(file_path, "wb") as f:
        f.write(file_bytes)
    
    relative_url = f"/evidence/ems/{unique_filename}"
    return file_path, relative_url


def compute_sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def process_and_compress_image(image_bytes: bytes) -> tuple[bytes, bytes]:
    try:
        img = Image.open(io.BytesIO(image_bytes))
        
        # 1. Compress
        img_copy = img.copy()
        img_copy.thumbnail((1024, 1024))
        compressed_out = io.BytesIO()
        save_format = "JPEG" if img_copy.mode == "RGB" else img.format or "JPEG"
        img_copy.save(compressed_out, format=save_format, quality=75)
        compressed_bytes = compressed_out.getvalue()
        
        # 2. Thumbnail
        img_thumb = img.copy()
        img_thumb.thumbnail((150, 150))
        thumbnail_out = io.BytesIO()
        img_thumb.save(thumbnail_out, format=save_format, quality=70)
        thumbnail_bytes = thumbnail_out.getvalue()
        
        return compressed_bytes, thumbnail_bytes
    except Exception as exc:
        logger.error("Error processing/compressing image: %s. Using original bytes.", exc)
        return image_bytes, image_bytes


@router.post("/evidence/upload-url", status_code=status.HTTP_200_OK)
async def request_upload_url(
    payload: UploadUrlRequest,
    db: Session = Depends(get_db)
):
    validate_user_org_rbac(db, payload.uploaded_by, payload.organization_id)
    validate_file_metadata(payload.mime_type, payload.file_size)

    folder = get_storage_folder(payload.activity, payload.entity_type)
    org_id = payload.organization_id
    proj_id = payload.project_id or "unlinked"
    
    _, ext = os.path.splitext(payload.filename)
    if not ext and payload.mime_type.startswith("image/"):
        ext = ".jpg" if payload.mime_type == "image/jpeg" else f".{payload.mime_type.split('/')[-1]}"
    
    uuid_filename = f"{uuid.uuid4()}{ext}"
    object_key = f"organizations/{org_id}/projects/{proj_id}/{folder}/{uuid_filename}"

    try:
        storage_provider = get_storage_provider()
        presigned_data = storage_provider.generate_presigned_upload_url(
            object_key=object_key,
            mime_type=payload.mime_type,
            file_size=payload.file_size
        )
    except Exception as e:
        logger.error("Failed to generate presigned upload URL: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to initialize storage provider or generate URL")

    try:
        evidence_record = Evidence(
            organization_id=uuid.UUID(org_id),
            project_id=uuid.UUID(payload.project_id) if payload.project_id else None,
            entity_type=payload.entity_type,
            entity_id=uuid.UUID(payload.entity_id),
            activity=payload.activity,
            uploaded_by=uuid.UUID(payload.uploaded_by),
            uploaded_by_role=payload.uploaded_by_role,
            capture_timestamp=datetime.now(timezone.utc),
            media_type="image" if payload.mime_type.startswith("image/") else "document",
            filename=uuid_filename,
            original_filename=payload.filename,
            storage_path=object_key,
            file_size=payload.file_size,
            mime_type=payload.mime_type,
            bucket_name=storage_provider.bucket_name,
            object_key=object_key,
            storage_provider="cloudflare_r2",
            upload_status="Pending",
            verification_status="Draft"
        )
        db.add(evidence_record)
        db.commit()
        
        audit_log = EvidenceAuditLog(
            evidence_id=evidence_record.id,
            user_id=uuid.UUID(payload.uploaded_by),
            action="upload_requested",
            details={
                "filename": payload.filename,
                "mime_type": payload.mime_type,
                "file_size": payload.file_size,
                "object_key": object_key
            }
        )
        db.add(audit_log)
        db.commit()

        return {
            "status": "success",
            "evidence_id": str(evidence_record.id),
            "upload_url": presigned_data["url"],
            "method": presigned_data["method"],
            "headers": presigned_data["headers"]
        }
    except Exception as e:
        db.rollback()
        logger.error("Failed to save pending evidence metadata: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to save upload metadata")


@router.post("/evidence/confirm-upload", status_code=status.HTTP_200_OK)
async def confirm_upload(
    payload: ConfirmUploadRequest,
    db: Session = Depends(get_db)
):
    try:
        evidence_id_uuid = uuid.UUID(payload.evidence_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid evidence_id format")

    evidence = db.query(Evidence).filter(Evidence.id == evidence_id_uuid).first()
    if not evidence:
        raise HTTPException(status_code=404, detail="Evidence record not found")

    if evidence.upload_status == "Completed":
        return {
            "status": "success",
            "message": "Upload already confirmed",
            "evidence_id": str(evidence.id)
        }

    try:
        storage_provider = get_storage_provider()
        is_verified = storage_provider.verify_upload(evidence.object_key, evidence.file_size)
    except Exception as e:
        logger.error("Error verifying storage object %s: %s", evidence.object_key, e)
        is_verified = False

    if not is_verified:
        raise HTTPException(
            status_code=400,
            detail="File upload verification failed. File not found in storage or size mismatch."
        )

    try:
        evidence.upload_status = "Completed"
        evidence.verification_status = "Uploaded"
        evidence.sha256_hash = payload.sha256_hash
        evidence.uploaded_at = datetime.now(timezone.utc)
        evidence.updated_at = datetime.now(timezone.utc)

        evidence_file = EvidenceFile(
            evidence_id=evidence.id,
            file_role="original",
            filename=evidence.original_filename,
            storage_path=evidence.object_key,
            file_size=evidence.file_size,
            mime_type=evidence.mime_type,
            sha256_hash=payload.sha256_hash
        )
        db.add(evidence_file)

        audit_log = EvidenceAuditLog(
            evidence_id=evidence.id,
            user_id=evidence.uploaded_by,
            action="upload_completed",
            details={
                "filename": evidence.original_filename,
                "object_key": evidence.object_key,
                "sha256_hash": payload.sha256_hash
            }
        )
        db.add(audit_log)
        db.commit()

        return {
            "status": "success",
            "message": "Evidence upload confirmed and verified successfully",
            "evidence_id": str(evidence.id)
        }
    except Exception as e:
        db.rollback()
        logger.error("Failed to confirm evidence upload: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Database confirmation failed")


@router.post("/public/attest/upload-url", status_code=status.HTTP_200_OK)
async def public_attest_upload_url(
    payload: PublicUploadUrlRequest,
    db: Session = Depends(get_db)
):
    try:
        shipment_id = verify_attestation_token(payload.token)
    except AttestationTokenExpiredError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except AttestationTokenInvalidError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Token verification failed: {exc}")

    shipment = db.query(Shipment).filter(Shipment.id == shipment_id).first()
    if not shipment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Shipment record not found.")

    if shipment.status == 'delivered':
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Attestation has already been submitted for this delivery.")

    org_id = None
    project_id = None
    if shipment.biochar_batch:
        batch = shipment.biochar_batch
        if batch.pyrolysis_run and batch.pyrolysis_run.feedstock_batch:
            feedstock = batch.pyrolysis_run.feedstock_batch
            if feedstock.project:
                project_id = str(feedstock.project.id)
                org_id = str(feedstock.project.organization_id)

    if not org_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Could not resolve organization associated with this shipment.")

    validate_file_metadata(payload.mime_type, payload.file_size)

    _, ext = os.path.splitext(payload.filename)
    if not ext and payload.mime_type.startswith("image/"):
        ext = ".jpg" if payload.mime_type == "image/jpeg" else f".{payload.mime_type.split('/')[-1]}"
    
    uuid_filename = f"{uuid.uuid4()}{ext}"
    proj_folder = project_id if project_id else "unlinked"
    object_key = f"organizations/{org_id}/projects/{proj_folder}/distribution/{uuid_filename}"

    try:
        storage_provider = get_storage_provider()
        presigned_data = storage_provider.generate_presigned_upload_url(
            object_key=object_key,
            mime_type=payload.mime_type,
            file_size=payload.file_size
        )
    except Exception as e:
        logger.error("Failed to generate presigned upload URL for attestation: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to initialize storage provider or generate URL")

    try:
        evidence_record = Evidence(
            organization_id=uuid.UUID(org_id),
            project_id=uuid.UUID(project_id) if project_id else None,
            entity_type="distribution",
            entity_id=uuid.UUID(shipment_id),
            activity="distribution",
            uploaded_by=None,
            uploaded_by_role="Farmer",
            capture_timestamp=datetime.now(timezone.utc),
            media_type="image" if payload.mime_type.startswith("image/") else "document",
            filename=uuid_filename,
            original_filename=payload.filename,
            storage_path=object_key,
            file_size=payload.file_size,
            mime_type=payload.mime_type,
            bucket_name=storage_provider.bucket_name,
            object_key=object_key,
            storage_provider="cloudflare_r2",
            upload_status="Pending",
            verification_status="Draft"
        )
        db.add(evidence_record)
        db.commit()

        audit_log = EvidenceAuditLog(
            evidence_id=evidence_record.id,
            user_id=None,
            action="upload_requested",
            details={
                "filename": payload.filename,
                "mime_type": payload.mime_type,
                "file_size": payload.file_size,
                "object_key": object_key,
                "shipment_id": shipment_id
            }
        )
        db.add(audit_log)
        db.commit()

        return {
            "status": "success",
            "evidence_id": str(evidence_record.id),
            "upload_url": presigned_data["url"],
            "method": presigned_data["method"],
            "headers": presigned_data["headers"],
            "object_key": object_key
        }
    except Exception as e:
        db.rollback()
        logger.error("Failed to create pending attestation metadata: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to save attestation upload metadata")


@router.post("/evidence/upload", status_code=status.HTTP_201_CREATED)
async def upload_evidence(
    file: UploadFile = File(...),
    organization_id: str = Form(...),
    project_id: Optional[str] = Form(None),
    entity_type: str = Form(...),
    entity_id: str = Form(...),
    activity: str = Form(...),
    uploaded_by: Optional[str] = Form(None),
    uploaded_by_role: Optional[str] = Form(None),
    capture_timestamp: Optional[str] = Form(None),
    latitude: Optional[float] = Form(None),
    longitude: Optional[float] = Form(None),
    altitude: Optional[float] = Form(None),
    device_information: Optional[str] = Form(None),
    db: Session = Depends(get_db)
):
    try:
        file_bytes = await file.read()
        filename = file.filename or "file"
        mime_type = file.content_type or "application/octet-stream"
        file_size = len(file_bytes)
        sha256_hash = compute_sha256(file_bytes)
        
        device_info_dict = None
        if device_information:
            try:
                import json
                device_info_dict = json.loads(device_information)
            except Exception:
                device_info_dict = {"raw": device_information}

        capture_dt = None
        if capture_timestamp:
            try:
                capture_dt = datetime.fromisoformat(capture_timestamp.replace("Z", "+00:00"))
            except Exception:
                capture_dt = datetime.now(timezone.utc)

        orig_storage, orig_url = save_evidence_file(file_bytes, filename, "original")

        evidence_record = Evidence(
            organization_id=uuid.UUID(organization_id),
            project_id=uuid.UUID(project_id) if project_id else None,
            entity_type=entity_type,
            entity_id=uuid.UUID(entity_id),
            activity=activity,
            uploaded_by=uuid.UUID(uploaded_by) if uploaded_by else None,
            uploaded_by_role=uploaded_by_role,
            capture_timestamp=capture_dt,
            latitude=latitude,
            longitude=longitude,
            altitude=altitude,
            device_information=device_info_dict,
            media_type="image" if mime_type.startswith("image/") else "document",
            filename=filename,
            storage_path=orig_url,
            file_size=file_size,
            mime_type=mime_type,
            sha256_hash=sha256_hash,
            verification_status="Draft",
        )
        db.add(evidence_record)
        db.flush()

        orig_file = EvidenceFile(
            evidence_id=evidence_record.id,
            file_role="original",
            filename=filename,
            storage_path=orig_url,
            file_size=file_size,
            mime_type=mime_type,
            sha256_hash=sha256_hash,
        )
        db.add(orig_file)

        if mime_type.startswith("image/"):
            compressed_bytes, thumbnail_bytes = process_and_compress_image(file_bytes)
            
            comp_storage, comp_url = save_evidence_file(compressed_bytes, filename, "compressed")
            comp_file = EvidenceFile(
                evidence_id=evidence_record.id,
                file_role="compressed",
                filename=f"compressed_{filename}",
                storage_path=comp_url,
                file_size=len(compressed_bytes),
                mime_type="image/jpeg",
                sha256_hash=compute_sha256(compressed_bytes),
            )
            db.add(comp_file)

            thumb_storage, thumb_url = save_evidence_file(thumbnail_bytes, filename, "thumbnail")
            thumb_file = EvidenceFile(
                evidence_id=evidence_record.id,
                file_role="thumbnail",
                filename=f"thumbnail_{filename}",
                storage_path=thumb_url,
                file_size=len(thumbnail_bytes),
                mime_type="image/jpeg",
                sha256_hash=compute_sha256(thumbnail_bytes),
            )
            db.add(thumb_file)

        audit_log = EvidenceAuditLog(
            evidence_id=evidence_record.id,
            user_id=uuid.UUID(uploaded_by) if uploaded_by else None,
            action="upload",
            details={
                "filename": filename,
                "mime_type": mime_type,
                "file_size": file_size,
                "entity_type": entity_type,
                "entity_id": entity_id,
            }
        )
        db.add(audit_log)
        db.commit()

        return {
            "status": "success",
            "message": "Evidence uploaded successfully",
            "evidence_id": str(evidence_record.id),
            "url": orig_url
        }
    except Exception as exc:
        db.rollback()
        logger.error("Failed to upload evidence: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to upload evidence: {exc}"
        )


def sign_storage_path(storage_path: Optional[str], storage_provider_name: Optional[str] = None) -> Optional[str]:
    if not storage_path:
        return storage_path
    if storage_provider_name == "cloudflare_r2" or (not storage_path.startswith("/") and not storage_path.startswith("http")):
        try:
            sp = get_storage_provider()
            return sp.generate_presigned_download_url(storage_path)
        except Exception as e:
            logger.error("Failed to sign R2 key %s: %s", storage_path, e)
    return storage_path


@router.get("/evidence/list")
async def list_evidence(
    organization_id: Optional[str] = None,
    project_id: Optional[str] = None,
    activity: Optional[str] = None,
    entity_type: Optional[str] = None,
    entity_id: Optional[str] = None,
    uploaded_by: Optional[str] = None,
    verification_status: Optional[str] = None,
    search: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
    db: Session = Depends(get_db)
):
    try:
        def parse_uuid(val: Optional[str]) -> Optional[uuid.UUID]:
            if not val or str(val).strip().lower() in ("null", "undefined", "none", ""):
                return None
            try:
                return uuid.UUID(str(val).strip())
            except (ValueError, TypeError, AttributeError):
                return None

        query = db.query(Evidence)

        org_uuid = parse_uuid(organization_id)
        if org_uuid:
            query = query.filter(Evidence.organization_id == org_uuid)

        proj_uuid = parse_uuid(project_id)
        if proj_uuid:
            query = query.filter(Evidence.project_id == proj_uuid)

        if activity:
            query = query.filter(Evidence.activity == activity)
        if entity_type:
            query = query.filter(Evidence.entity_type == entity_type)

        ent_uuid = parse_uuid(entity_id)
        if ent_uuid:
            query = query.filter(Evidence.entity_id == ent_uuid)

        up_uuid = parse_uuid(uploaded_by)
        if up_uuid:
            query = query.filter(Evidence.uploaded_by == up_uuid)

        if verification_status:
            query = query.filter(Evidence.verification_status == verification_status)
            
        if search:
            query = query.filter(
                or_(
                    Evidence.filename.ilike(f"%{search}%"),
                    Evidence.remarks.ilike(f"%{search}%"),
                    Evidence.uploaded_by_role.ilike(f"%{search}%"),
                    Evidence.entity_type.ilike(f"%{search}%"),
                )
            )

        total = query.count()
        offset = (page - 1) * page_size
        records = query.order_by(Evidence.upload_timestamp.desc()).offset(offset).limit(page_size).all()

        results = []
        for r in records:
            files_list = db.query(EvidenceFile).filter(EvidenceFile.evidence_id == r.id).all()
            files_data = [{
                "id": str(f.id),
                "file_role": f.file_role,
                "filename": f.filename,
                "storage_path": sign_storage_path(f.storage_path, r.storage_provider),
                "file_size": f.file_size,
                "mime_type": f.mime_type,
                "sha256_hash": f.sha256_hash,
            } for f in files_list]

            reviews_list = db.query(EvidenceReview).filter(EvidenceReview.evidence_id == r.id).all()
            reviews_data = [{
                "id": str(rev.id),
                "reviewer_id": str(rev.reviewer_id),
                "review_time": rev.review_time.isoformat() if rev.review_time else None,
                "action": rev.action,
                "comments": rev.comments,
                "previous_status": rev.previous_status,
                "new_status": rev.new_status
            } for rev in reviews_list]

            results.append({
                "id": str(r.id),
                "project_id": str(r.project_id) if r.project_id else None,
                "entity_type": r.entity_type,
                "entity_id": str(r.entity_id),
                "activity": r.activity,
                "uploaded_by": str(r.uploaded_by) if r.uploaded_by else None,
                "uploaded_by_role": r.uploaded_by_role,
                "capture_timestamp": r.capture_timestamp.isoformat() if r.capture_timestamp else None,
                "upload_timestamp": r.upload_timestamp.isoformat(),
                "latitude": r.latitude,
                "longitude": r.longitude,
                "altitude": r.altitude,
                "device_information": r.device_information,
                "media_type": r.media_type,
                "filename": r.filename,
                "storage_path": sign_storage_path(r.storage_path, r.storage_provider),
                "file_size": r.file_size,
                "mime_type": r.mime_type,
                "sha256_hash": r.sha256_hash,
                "verification_status": r.verification_status,
                "reviewer_id": str(r.reviewer_id) if r.reviewer_id else None,
                "reviewed_at": r.reviewed_at.isoformat() if r.reviewed_at else None,
                "remarks": r.remarks,
                "files": files_data,
                "reviews": reviews_data,
            })

        return {
            "status": "success",
            "total": total,
            "page": page,
            "page_size": page_size,
            "data": results
        }
    except Exception as exc:
        logger.error("Failed to list evidence: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list evidence: {exc}"
        )


@router.get("/evidence/{evidence_id}")
async def get_evidence(evidence_id: str, db: Session = Depends(get_db)):
    try:
        r = db.query(Evidence).filter(Evidence.id == uuid.UUID(evidence_id)).first()
        if not r:
            raise HTTPException(status_code=404, detail="Evidence record not found")

        files_list = db.query(EvidenceFile).filter(EvidenceFile.evidence_id == r.id).all()
        files_data = [{
            "id": str(f.id),
            "file_role": f.file_role,
            "filename": f.filename,
            "storage_path": sign_storage_path(f.storage_path, r.storage_provider),
            "file_size": f.file_size,
            "mime_type": f.mime_type,
            "sha256_hash": f.sha256_hash,
        } for f in files_list]

        reviews_list = db.query(EvidenceReview).filter(EvidenceReview.evidence_id == r.id).all()
        reviews_data = [{
            "id": str(rev.id),
            "reviewer_id": str(rev.reviewer_id),
            "review_time": rev.review_time.isoformat() if rev.review_time else None,
            "action": rev.action,
            "comments": rev.comments,
            "previous_status": rev.previous_status,
            "new_status": rev.new_status
        } for rev in reviews_list]

        return {
            "status": "success",
            "data": {
                "id": str(r.id),
                "organization_id": str(r.organization_id),
                "project_id": str(r.project_id) if r.project_id else None,
                "entity_type": r.entity_type,
                "entity_id": str(r.entity_id),
                "activity": r.activity,
                "uploaded_by": str(r.uploaded_by) if r.uploaded_by else None,
                "uploaded_by_role": r.uploaded_by_role,
                "capture_timestamp": r.capture_timestamp.isoformat() if r.capture_timestamp else None,
                "upload_timestamp": r.upload_timestamp.isoformat(),
                "latitude": r.latitude,
                "longitude": r.longitude,
                "altitude": r.altitude,
                "device_information": r.device_information,
                "media_type": r.media_type,
                "filename": r.filename,
                "storage_path": sign_storage_path(r.storage_path, r.storage_provider),
                "file_size": r.file_size,
                "mime_type": r.mime_type,
                "sha256_hash": r.sha256_hash,
                "verification_status": r.verification_status,
                "reviewer_id": str(r.reviewer_id) if r.reviewer_id else None,
                "reviewed_at": r.reviewed_at.isoformat() if r.reviewed_at else None,
                "remarks": r.remarks,
                "files": files_data,
                "reviews": reviews_data,
            }
        }
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Failed to retrieve evidence details: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve evidence details: {exc}"
        )


@router.post("/evidence/{evidence_id}/review")
async def review_evidence(
    evidence_id: str,
    reviewer_id: str = Form(...),
    action: str = Form(...),
    comments: Optional[str] = Form(None),
    db: Session = Depends(get_db)
):
    try:
        r = db.query(Evidence).filter(Evidence.id == uuid.UUID(evidence_id)).first()
        if not r:
            raise HTTPException(status_code=404, detail="Evidence record not found")

        if r.verification_status == "Locked":
            raise HTTPException(status_code=400, detail="Cannot review locked evidence")

        prev_status = r.verification_status
        new_status = prev_status

        if action == "Approve":
            new_status = "Approved"
        elif action == "Reject":
            new_status = "Rejected"
        elif action == "Lock":
            new_status = "Locked"
        else:
            raise HTTPException(status_code=400, detail=f"Invalid action: {action}")

        r.verification_status = new_status
        r.reviewer_id = uuid.UUID(reviewer_id)
        r.reviewed_at = datetime.now(timezone.utc)
        if comments:
            r.remarks = comments

        review_record = EvidenceReview(
            evidence_id=r.id,
            reviewer_id=uuid.UUID(reviewer_id),
            action=action,
            comments=comments,
            previous_status=prev_status,
            new_status=new_status,
        )
        db.add(review_record)

        audit_log = EvidenceAuditLog(
            evidence_id=r.id,
            user_id=uuid.UUID(reviewer_id),
            action=action.lower(),
            details={
                "comments": comments,
                "previous_status": prev_status,
                "new_status": new_status,
            }
        )
        db.add(audit_log)
        db.commit()

        return {
            "status": "success",
            "message": f"Evidence successfully reviewed and marked as {new_status}",
            "new_status": new_status
        }
    except HTTPException:
        raise
    except Exception as exc:
        db.rollback()
        logger.error("Failed to review evidence: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to review evidence: {exc}"
        )


@router.delete("/evidence/{evidence_id}")
async def delete_evidence(
    evidence_id: str,
    user_id: str = Form(...),
    db: Session = Depends(get_db)
):
    try:
        r = db.query(Evidence).filter(Evidence.id == uuid.UUID(evidence_id)).first()
        if not r:
            raise HTTPException(status_code=404, detail="Evidence record not found")

        if r.verification_status == "Locked":
            raise HTTPException(status_code=400, detail="Locked evidence cannot be deleted")

        files_list = db.query(EvidenceFile).filter(EvidenceFile.evidence_id == r.id).all()
        for f in files_list:
            if r.storage_provider == "cloudflare_r2" or (f.storage_path and not f.storage_path.startswith("/") and not f.storage_path.startswith("http")):
                try:
                    sp = get_storage_provider()
                    sp.delete_file(f.storage_path)
                except Exception as e:
                    logger.error("Failed to delete R2 file %s: %s", f.storage_path, e)
            elif f.storage_path and f.storage_path.startswith("/evidence/ems/"):
                local_path = os.path.join(os.path.dirname(__file__), "..", "frontend", f.storage_path.lstrip("/"))
                if os.path.exists(local_path):
                    try:
                        os.remove(local_path)
                    except Exception as e:
                        logger.error("Failed to delete local file %s: %s", local_path, e)

        db.delete(r)

        audit_log = EvidenceAuditLog(
            user_id=uuid.UUID(user_id),
            action="delete",
            details={
                "evidence_id": evidence_id,
                "filename": r.filename,
            }
        )
        db.add(audit_log)
        db.commit()

        return {
            "status": "success",
            "message": "Evidence record and associated files successfully deleted"
        }
    except HTTPException:
        raise
    except Exception as exc:
        db.rollback()
        logger.error("Failed to delete evidence: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete evidence: {exc}"
        )


@router.get("/evidence/{evidence_id}/download/{file_role}")
async def download_evidence(
    evidence_id: str,
    file_role: str,
    user_id: Optional[str] = None,
    db: Session = Depends(get_db)
):
    try:
        r = db.query(Evidence).filter(Evidence.id == uuid.UUID(evidence_id)).first()
        if not r:
            raise HTTPException(status_code=404, detail="Evidence record not found")

        f = db.query(EvidenceFile).filter(
            EvidenceFile.evidence_id == r.id,
            EvidenceFile.file_role == file_role
        ).first()

        if not f:
            raise HTTPException(status_code=404, detail=f"File with role {file_role} not found")

        audit_log = EvidenceAuditLog(
            evidence_id=r.id,
            user_id=uuid.UUID(user_id) if user_id else None,
            action="download",
            details={
                "file_role": file_role,
                "filename": f.filename
            }
        )
        db.add(audit_log)
        db.commit()

        if r.storage_provider == "cloudflare_r2" or (f.storage_path and not f.storage_path.startswith("/") and not f.storage_path.startswith("http")):
            try:
                sp = get_storage_provider()
                signed_url = sp.generate_presigned_download_url(f.storage_path)
                from fastapi.responses import RedirectResponse
                return RedirectResponse(url=signed_url)
            except Exception as e:
                logger.error("Failed to generate presigned download URL for %s: %s", f.storage_path, e)
                raise HTTPException(status_code=500, detail="Failed to generate download URL from storage provider")

        if f.storage_path.startswith("/evidence/ems/"):
            local_path = os.path.join(os.path.dirname(__file__), "..", "frontend", f.storage_path.lstrip("/"))
            if not os.path.exists(local_path):
                raise HTTPException(status_code=404, detail="Local file missing on server disk")
            return FileResponse(path=local_path, media_type=f.mime_type, filename=f.filename)

        from fastapi.responses import RedirectResponse
        return RedirectResponse(url=f.storage_path)

    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Failed to download evidence file: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to download evidence file: {exc}"
        )


# ─── Mass Balance & Anomaly Engine Endpoints ──────────────────────────────────

class FeedstockEvaluateRequest(BaseModel):
    batch_code: str
    project_id: str
    feedstock_type: str
    wet_weight_kg: float
    moisture_percent: float
    moisture_measurement_method: Optional[str] = "Oven Drying"
    expected_yield_percent: Optional[float] = 30.0
    supplier_name: Optional[str] = None
    origin_location: Optional[str] = None
    organization_id: Optional[str] = None


class BatchEvaluateRequest(BaseModel):
    batch_code: str
    pyrolysis_run_id: str
    produced_weight_kg: float
    storage_location: Optional[str] = None
    organization_id: Optional[str] = None


class ResolveAlertRequest(BaseModel):
    user_id: Optional[str] = None
    comments: Optional[str] = None


class MassBalanceConfigRequest(BaseModel):
    organization_id: Optional[str] = None
    min_yield_percent: float = Field(15.0, ge=0.0, le=100.0)
    max_yield_percent: float = Field(50.0, ge=0.0, le=100.0)
    max_moisture_percent: float = Field(65.0, ge=0.0, le=100.0)


@router.post("/mass-balance/feedstock/evaluate", status_code=status.HTTP_200_OK)
async def evaluate_feedstock_mass_balance(
    payload: FeedstockEvaluateRequest,
    db: Session = Depends(get_db)
):
    """
    Evaluates feedstock mass balance calculations (dry weight & water weight) and detects moisture/input anomalies.
    Persists or updates FeedstockBatch record.
    """
    try:
        project_uuid = uuid.UUID(payload.project_id)
        org_uuid = uuid.UUID(payload.organization_id) if payload.organization_id else None
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project_id or organization_id UUID format")

    batch = db.query(FeedstockBatch).filter(FeedstockBatch.batch_code == payload.batch_code).first()
    if not batch:
        batch = FeedstockBatch(
            project_id=project_uuid,
            batch_code=payload.batch_code,
            feedstock_type=payload.feedstock_type,
            supplier_name=payload.supplier_name,
            origin_location=payload.origin_location,
        )
        db.add(batch)
        db.flush()

    batch.wet_weight_kg = payload.wet_weight_kg
    batch.weight_kg = payload.wet_weight_kg
    batch.moisture_percent = payload.moisture_percent
    batch.moisture_measurement_method = payload.moisture_measurement_method
    batch.expected_yield_percent = payload.expected_yield_percent

    anomalies = MassBalanceService.evaluate_feedstock(
        db=db,
        feedstock_batch=batch,
        organization_id=org_uuid,
        project_id=project_uuid,
    )
    db.commit()

    return {
        "status": "success",
        "batch_id": str(batch.id),
        "batch_code": batch.batch_code,
        "wet_weight_kg": batch.wet_weight_kg,
        "dry_weight_kg": batch.dry_weight_kg,
        "water_weight_kg": batch.water_weight_kg,
        "moisture_percent": batch.moisture_percent,
        "anomalies": [a.to_dict() for a in anomalies],
    }


@router.post("/mass-balance/batch/evaluate", status_code=status.HTTP_200_OK)
async def evaluate_biochar_batch_mass_balance(
    payload: BatchEvaluateRequest,
    db: Session = Depends(get_db)
):
    """
    Evaluates biochar production yield percentage against dry biomass input and flags yield anomalies.
    """
    try:
        run_uuid = uuid.UUID(payload.pyrolysis_run_id)
        org_uuid = uuid.UUID(payload.organization_id) if payload.organization_id else None
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid pyrolysis_run_id or organization_id UUID format")

    batch = db.query(BiocharBatch).filter(BiocharBatch.batch_code == payload.batch_code).first()
    if not batch:
        batch = BiocharBatch(
            pyrolysis_run_id=run_uuid,
            batch_code=payload.batch_code,
            storage_location=payload.storage_location,
        )
        db.add(batch)
        db.flush()

    batch.produced_weight_kg = payload.produced_weight_kg
    batch.weight_kg = payload.produced_weight_kg

    anomalies = MassBalanceService.evaluate_biochar_batch(
        db=db,
        biochar_batch=batch,
        organization_id=org_uuid,
    )
    db.commit()

    return {
        "status": "success",
        "batch_id": str(batch.id),
        "batch_code": batch.batch_code,
        "produced_weight_kg": batch.produced_weight_kg,
        "calculated_yield_percent": batch.calculated_yield_percent,
        "mass_balance_status": batch.mass_balance_status,
        "anomaly_status": batch.anomaly_status,
        "anomaly_reason": batch.anomaly_reason,
        "anomalies": [a.to_dict() for a in anomalies],
    }


@router.get("/mass-balance/dashboard-stats", status_code=status.HTTP_200_OK)
async def get_mass_balance_dashboard_stats(
    organization_id: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Returns aggregated Mass Balance metrics for Executive Dashboard widgets & Yield Trend chart.
    """
    feedstock_query = db.query(FeedstockBatch)
    batch_query = db.query(BiocharBatch)
    anomalies_query = db.query(MassBalanceAnomaly).filter(MassBalanceAnomaly.status == "Active")

    if organization_id:
        try:
            org_uuid = uuid.UUID(organization_id)
            anomalies_query = anomalies_query.filter(MassBalanceAnomaly.organization_id == org_uuid)
        except ValueError:
            pass

    feedstocks = feedstock_query.all()
    batches = batch_query.all()
    active_anomalies = anomalies_query.all()

    total_wet_kg = sum(f.wet_weight_kg or f.weight_kg or 0 for f in feedstocks)
    total_dry_kg = sum(f.dry_weight_kg or 0 for f in feedstocks)

    valid_moistures = [f.moisture_percent for f in feedstocks if f.moisture_percent is not None]
    avg_moisture = (sum(valid_moistures) / len(valid_moistures)) if valid_moistures else 0.0

    total_produced_kg = sum(b.produced_weight_kg or b.weight_kg or 0 for b in batches)
    valid_yields = [b.calculated_yield_percent for b in batches if b.calculated_yield_percent is not None]
    avg_yield = (sum(valid_yields) / len(valid_yields)) if valid_yields else 0.0

    # Build yield trend timeline (latest 20 batches)
    yield_trend = []
    sorted_batches = sorted(batches, key=lambda x: x.created_at or datetime.min)
    for b in sorted_batches[-20:]:
        yield_trend.append({
            "batch_code": b.batch_code,
            "created_at": b.created_at.isoformat() if b.created_at else None,
            "calculated_yield": b.calculated_yield_percent,
            "mass_balance_status": b.mass_balance_status,
            "anomaly_status": b.anomaly_status,
        })

    return {
        "status": "success",
        "total_wet_biomass_kg": round(total_wet_kg, 2),
        "total_wet_biomass_tonnes": round(total_wet_kg / 1000.0, 3),
        "total_dry_biomass_kg": round(total_dry_kg, 2),
        "total_dry_biomass_tonnes": round(total_dry_kg / 1000.0, 3),
        "average_moisture_percent": round(avg_moisture, 2),
        "total_biochar_produced_kg": round(total_produced_kg, 2),
        "total_biochar_produced_tonnes": round(total_produced_kg / 1000.0, 3),
        "average_yield_percent": round(avg_yield, 2),
        "active_anomalies_count": len(active_anomalies),
        "yield_trend": yield_trend,
    }


@router.get("/mass-balance/alerts", status_code=status.HTTP_200_OK)
async def get_operational_alerts(
    organization_id: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Retrieves unresolved operational alerts / anomalies for the Operational Alerts panel.
    """
    query = db.query(MassBalanceAnomaly).filter(MassBalanceAnomaly.status == "Active")
    if organization_id:
        try:
            org_uuid = uuid.UUID(organization_id)
            query = query.filter(MassBalanceAnomaly.organization_id == org_uuid)
        except ValueError:
            pass

    alerts = query.order_by(MassBalanceAnomaly.created_at.desc()).all()

    results = []
    for a in alerts:
        results.append({
            "id": str(a.id),
            "organization_id": str(a.organization_id) if a.organization_id else None,
            "project_id": str(a.project_id) if a.project_id else None,
            "entity_type": a.entity_type,
            "entity_id": str(a.entity_id),
            "severity": a.severity,
            "category": a.category,
            "explanation": a.human_readable_explanation,
            "status": a.status,
            "created_at": a.created_at.isoformat() if a.created_at else None,
        })

    return {"status": "success", "alerts": results, "total_active": len(results)}


@router.post("/mass-balance/alerts/{alert_id}/resolve", status_code=status.HTTP_200_OK)
async def resolve_operational_alert(
    alert_id: str,
    payload: ResolveAlertRequest,
    db: Session = Depends(get_db)
):
    """
    Marks an operational anomaly alert as Resolved.
    """
    try:
        alert_uuid = uuid.UUID(alert_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid alert_id UUID format")

    alert = db.query(MassBalanceAnomaly).filter(MassBalanceAnomaly.id == alert_uuid).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")

    user_uuid = uuid.UUID(payload.user_id) if payload.user_id else None

    alert.status = "Resolved"
    alert.resolved_at = datetime.now(timezone.utc)
    alert.resolved_by = user_uuid

    # Log audit record
    audit_log = EvidenceAuditLog(
        user_id=user_uuid,
        action="RESOLVE_MASS_BALANCE_ANOMALY",
        details={
            "alert_id": alert_id,
            "entity_type": alert.entity_type,
            "entity_id": str(alert.entity_id),
            "category": alert.category,
            "comments": payload.comments,
        }
    )
    db.add(audit_log)
    db.commit()

    return {"status": "success", "message": "Operational alert resolved successfully", "alert_id": alert_id}


@router.get("/mass-balance/config", status_code=status.HTTP_200_OK)
async def get_mass_balance_config(
    organization_id: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Retrieves mass balance threshold configuration for an organization or default.
    """
    org_uuid = uuid.UUID(organization_id) if organization_id else None
    config = MassBalanceService.get_organization_config(db, org_uuid)

    return {
        "status": "success",
        "organization_id": organization_id,
        "min_yield_percent": config.min_yield_percent,
        "max_yield_percent": config.max_yield_percent,
        "max_moisture_percent": config.max_moisture_percent,
    }


@router.post("/mass-balance/config", status_code=status.HTTP_200_OK)
async def set_mass_balance_config(
    payload: MassBalanceConfigRequest,
    db: Session = Depends(get_db)
):
    """
    Sets mass balance threshold configuration (min yield, max yield, max moisture).
    """
    org_uuid = uuid.UUID(payload.organization_id) if payload.organization_id else None
    config = None
    if org_uuid:
        config = db.query(MassBalanceConfig).filter(MassBalanceConfig.organization_id == org_uuid).first()

    if not config:
        config = MassBalanceConfig(organization_id=org_uuid)
        db.add(config)

    config.min_yield_percent = payload.min_yield_percent
    config.max_yield_percent = payload.max_yield_percent
    config.max_moisture_percent = payload.max_moisture_percent
    config.updated_at = datetime.now(timezone.utc)

    db.commit()

    return {
        "status": "success",
        "message": "Mass balance threshold configuration updated successfully",
        "config": {
            "min_yield_percent": config.min_yield_percent,
            "max_yield_percent": config.max_yield_percent,
            "max_moisture_percent": config.max_moisture_percent,
        }
    }

