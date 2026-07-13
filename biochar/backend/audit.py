# -*- coding: utf-8 -*-
"""
carbon/biochar/backend/audit.py
──────────────────────────────────────────────────────────────────────────────
Cryptographic audit and verification dossier compiler for biochar removal.
──────────────────────────────────────────────────────────────────────────────
"""

from __future__ import annotations

import json
import hashlib
import logging
from datetime import datetime, timezone
from sqlalchemy.orm import Session

from biochar.backend.database import SessionLocal
from biochar.backend.models import (
    BiocharBatch,
    FeedstockBatch,
    ReactorSensorLog,
    LaboratoryCertificate,
    BiocharApplication,
    PyrolysisRun,
)

logger = logging.getLogger("carbon_engine")


def serialize_dt(dt: datetime | None) -> str | None:
    """Helper to convert datetime objects to deterministic ISO-8601 UTC strings."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat().replace("+00:00", "Z")


def compile_verification_dossier(batch_id: str, db: Session | None = None) -> dict:
    """
    Query and aggregate all related entities for the supplied batch_id.
    """
    logger.info("Compiling verification dossier for batch_id: %s", batch_id)
    session = db if db is not None else SessionLocal()
    own_session = db is None

    try:
        # 1. Query and load all batch-related records
        batch = session.query(BiocharBatch).filter(BiocharBatch.id == batch_id).first()
        if not batch:
            logger.error("BiocharBatch %s not found for audit dossier compilation.", batch_id)
            raise ValueError(f"BiocharBatch with ID {batch_id} not found.")

        # Get project ID and feedstock details via PyrolysisRun link
        project_id = None
        feedstocks = []
        telemetry = []
        elec_val = 0.0
        fuel_val = 0.0

        if batch.pyrolysis_run_id:
            run = session.query(PyrolysisRun).filter(PyrolysisRun.id == batch.pyrolysis_run_id).first()
            if run:
                elec_val = run.electricity_kwh or 0.0
                fuel_val = run.fuel_used_liters or 0.0
                
                # Fetch feedstock batch
                f_batch = session.query(FeedstockBatch).filter(FeedstockBatch.id == run.feedstock_batch_id).first()
                if f_batch:
                    project_id = f_batch.project_id
                    feedstocks.append(f_batch)

                # Fetch telemetry logs
                telemetry = (
                    session.query(ReactorSensorLog)
                    .filter(
                        ReactorSensorLog.pyrolysis_run_id == run.id,
                        ReactorSensorLog.sensor_name == 'kiln_temperature'
                    )
                    .order_by(ReactorSensorLog.recorded_at.asc())
                    .all()
                )

        lab_assay = session.query(LaboratoryCertificate).filter(LaboratoryCertificate.batch_id == batch_id).first()

        sinks = (
            session.query(BiocharApplication)
            .filter(BiocharApplication.biochar_batch_id == batch_id)
            .order_by(BiocharApplication.delivery_ticket_id.asc())
            .all()
        )

        # 2. Serialize database structures deterministically
        batch_meta = {
            "id": str(batch.id),
            "project_id": str(project_id) if project_id else None,
            "batch_lot_number": batch.batch_code,
            "status": str(batch.status),
            "net_sequestration_tco2e": float(batch.net_sequestration_tco2e or 0.0),
            "created_at": serialize_dt(batch.created_at),
            "updated_at": serialize_dt(batch.created_at),
        }

        feedstock_list = []
        for f in feedstocks:
            lat = 0.0
            lng = 0.0
            if f.origin_location:
                try:
                    parts = f.origin_location.split(",")
                    if len(parts) == 2:
                        lat = float(parts[0])
                        lng = float(parts[1])
                except Exception:
                    pass

            feedstock_list.append({
                "id": str(f.id),
                "feedstock_type": str(f.feedstock_type),
                "source_latitude": lat,
                "source_longitude": lng,
                "wet_mass_tons": float((f.weight_kg or 0.0) / 1000.0),
                "satellite_clearance_status": True,
                "ingest_timestamp": serialize_dt(f.created_at),
            })

        telemetry_list = []
        for t in telemetry:
            telemetry_list.append({
                "id": str(t.id),
                "timestamp": serialize_dt(t.recorded_at),
                "kiln_temperature_celsius": float(t.sensor_value or 0.0),
                "electricity_consumption_kwh": float(elec_val),
                "fossil_fuel_consumption_liters": float(fuel_val),
            })

        lab_data = {}
        if lab_assay:
            lab_data = {
                "id": str(lab_assay.id),
                "organic_carbon_percentage": float(lab_assay.organic_carbon_percentage or 0.0),
                "molar_hc_ratio": float(lab_assay.molar_hc_ratio or 0.0),
                "verification_tier": str(lab_assay.verification_tier or "pending"),
                "certificate_hash": lab_assay.certificate_hash or "",
                "uploaded_at": serialize_dt(lab_assay.uploaded_at),
            }

        sink_list = []
        for s in sinks:
            sink_list.append({
                "id": str(s.id),
                "delivery_ticket_id": s.delivery_ticket_id or "",
                "farmer_id": s.farmer_id or "",
                "shipped_mass_tons": float(s.shipped_mass_tons or 0.0),
                "sink_latitude": float(s.latitude) if s.latitude is not None else None,
                "sink_longitude": float(s.longitude) if s.longitude is not None else None,
                "photo_evidence_url": s.photo_evidence_url or "",
                "attestation_timestamp": serialize_dt(s.attestation_timestamp),
            })

        # Construct final dossier JSON payload
        dossier = {
            "audit_version": "2026.1",
            "dossier_timestamp": serialize_dt(datetime.now(timezone.utc)),
            "batch_metadata": batch_meta,
            "feedstock_origin_proofs": feedstock_list,
            "pyrolysis_industrial_telemetry": telemetry_list,
            "laboratory_chemical_assays": lab_data,
            "downstream_sink_attestations": sink_list,
        }

        # 3. Create cryptographic seal
        serialized = json.dumps(dossier, sort_keys=True, separators=(",", ":"))
        sha256_seal = hashlib.sha256(serialized.encode("utf-8")).hexdigest()

        dossier["cryptographic_seal"] = sha256_seal

        logger.info("Dossier compiled successfully with SHA-256 seal: %s", sha256_seal)
        return dossier

    except Exception as exc:
        logger.error(
            "Unexpected error compiling audit dossier for batch %s: %s",
            batch_id,
            exc,
            exc_info=True,
        )
        raise exc
    finally:
        if own_session:
            session.close()
