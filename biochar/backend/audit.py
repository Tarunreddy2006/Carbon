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
    FeedstockIngest,
    PyrolysisTelemetry,
    LabAssay,
    DistributionSink,
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
    Sorts elements deterministically, formats fields strictly, and seals the
    dossier using a SHA-256 hash calculated across the serialized payload.
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

        feedstocks = (
            session.query(FeedstockIngest)
            .filter(FeedstockIngest.batch_id == batch_id)
            .order_by(FeedstockIngest.created_at.asc())
            .all()
        )

        telemetry = (
            session.query(PyrolysisTelemetry)
            .filter(PyrolysisTelemetry.batch_id == batch_id)
            .order_by(PyrolysisTelemetry.timestamp.asc())
            .all()
        )

        lab_assay = session.query(LabAssay).filter(LabAssay.batch_id == batch_id).first()

        sinks = (
            session.query(DistributionSink)
            .filter(DistributionSink.batch_id == batch_id)
            .order_by(DistributionSink.delivery_ticket_id.asc())
            .all()
        )

        # 2. Serialize database structures deterministically
        batch_meta = {
            "id": batch.id,
            "project_id": batch.project_id,
            "batch_lot_number": batch.batch_lot_number,
            "status": batch.status.value if hasattr(batch.status, "value") else str(batch.status),
            "net_sequestration_tco2e": (
                float(batch.net_sequestration_tco2e) if batch.net_sequestration_tco2e is not None else 0.0
            ),
            "created_at": serialize_dt(batch.created_at),
            "updated_at": serialize_dt(batch.updated_at),
        }

        feedstock_list = []
        for f in feedstocks:
            feedstock_list.append({
                "id": f.id,
                "feedstock_type": f.feedstock_type.value if hasattr(f.feedstock_type, "value") else str(f.feedstock_type),
                "source_latitude": float(f.source_latitude),
                "source_longitude": float(f.source_longitude),
                "wet_mass_tons": float(f.wet_mass_tons),
                "satellite_clearance_status": bool(f.satellite_clearance_status),
                "ingest_timestamp": serialize_dt(f.created_at),
            })

        telemetry_list = []
        for t in telemetry:
            telemetry_list.append({
                "id": t.id,
                "timestamp": serialize_dt(t.timestamp),
                "kiln_temperature_celsius": float(t.kiln_temperature_celsius),
                "electricity_consumption_kwh": float(t.electricity_consumption_kwh),
                "fossil_fuel_consumption_liters": float(t.fossil_fuel_consumption_liters),
            })

        lab_data = {}
        if lab_assay:
            lab_data = {
                "id": lab_assay.id,
                "organic_carbon_percentage": float(lab_assay.organic_carbon_percentage),
                "molar_hc_ratio": float(lab_assay.molar_hc_ratio),
                "verification_tier": (
                    lab_assay.verification_tier.value
                    if hasattr(lab_assay.verification_tier, "value")
                    else str(lab_assay.verification_tier)
                ),
                "certificate_hash": lab_assay.certificate_hash,
                "uploaded_at": serialize_dt(lab_assay.uploaded_at),
            }

        sink_list = []
        for s in sinks:
            sink_list.append({
                "id": s.id,
                "delivery_ticket_id": s.delivery_ticket_id,
                "farmer_id": s.farmer_id,
                "shipped_mass_tons": float(s.shipped_mass_tons),
                "sink_latitude": float(s.sink_latitude) if s.sink_latitude is not None else None,
                "sink_longitude": float(s.sink_longitude) if s.sink_longitude is not None else None,
                "photo_evidence_url": s.photo_evidence_url,
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
        # Serialize with strict sorted keys and compact layout separators
        serialized = json.dumps(dossier, sort_keys=True, separators=(",", ":"))
        sha256_seal = hashlib.sha256(serialized.encode("utf-8")).hexdigest()

        # Add signature seal at the outermost level
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
