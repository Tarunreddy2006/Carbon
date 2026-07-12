"""
carbon/biochar/backend/models.py
──────────────────────────────────────────────────────────────────────────────
Phase 1 – Database Scaffolding

SQLAlchemy ORM models for the biochar carbon-removal pipeline.
Every table links back to the shared global ``projects`` entity via
``project_id`` (on the batch root) or transitively through ``batch_id``.

Enum columns use native DB-level enums on Postgres and fall back to
VARCHAR check-constraints on SQLite so the dev workflow stays zero-config.
──────────────────────────────────────────────────────────────────────────────
"""

from __future__ import annotations

import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    BigInteger,
    Boolean,
    Column,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
    event,
    text,
)
from sqlalchemy.orm import relationship

from biochar.backend.database import Base


# ──────────────────────────────────────────────────────────────────────────────
# Enum definitions
# ──────────────────────────────────────────────────────────────────────────────

class BatchStatus(str, enum.Enum):
    """Lifecycle states a biochar batch moves through."""
    sourcing_purgatory = "sourcing_purgatory"
    processing_active = "processing_active"
    lab_certified = "lab_certified"
    completed = "completed"
    ineligible = "ineligible"


class FeedstockType(str, enum.Enum):
    """Supported biomass feedstock categories."""
    rice_husk = "rice_husk"
    wood_residue = "wood_residue"
    coffee_hulls = "coffee_hulls"


class VerificationTier(str, enum.Enum):
    """Lab permanence classification tiers."""
    pending = "pending"
    standard_200yr = "standard_200yr"
    high_permanence_1000yr = "high_permanence_1000yr"


# ──────────────────────────────────────────────────────────────────────────────
# Helper
# ──────────────────────────────────────────────────────────────────────────────

def _generate_uuid() -> str:
    """Return a new UUID4 hex string for use as a default PK value."""
    return str(uuid.uuid4())


def _utcnow() -> datetime:
    """Timezone-aware UTC timestamp for column defaults."""
    return datetime.now(timezone.utc)


# ──────────────────────────────────────────────────────────────────────────────
# Global shared entity (referenced by biochar batches)
# ──────────────────────────────────────────────────────────────────────────────

class Project(Base):
    """
    Global Project entity shared across all carbon verticals.

    Defined here so that the foreign-key target resolves within the same
    metadata.  If a ``projects`` table already exists in a shared schema,
    this declaration can be swapped for a reflected or imported reference.
    """
    __tablename__ = "projects"

    id = Column(
        String(36),
        primary_key=True,
        default=_generate_uuid,
        comment="UUID v4 project identifier",
    )
    name = Column(
        String(255),
        nullable=False,
        comment="Human-readable project name",
    )
    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=_utcnow,
        comment="Row creation timestamp (UTC)",
    )
    updated_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=_utcnow,
        onupdate=_utcnow,
        comment="Last modification timestamp (UTC)",
    )

    # ── back-refs ────────────────────────────────────────────────────────
    biochar_batches = relationship(
        "BiocharBatch",
        back_populates="project",
        cascade="all, delete-orphan",
        lazy="selectin",
    )

    def __repr__(self) -> str:
        return f"<Project id={self.id!r} name={self.name!r}>"


# ──────────────────────────────────────────────────────────────────────────────
# BiocharBatch
# ──────────────────────────────────────────────────────────────────────────────

class BiocharBatch(Base):
    """
    Root entity for a single biochar production batch.

    The ``batch_lot_number`` is unique *per project* (composite unique index),
    allowing lot-number reuse across independent projects.
    """
    __tablename__ = "biochar_batches"
    __table_args__ = (
        UniqueConstraint(
            "project_id",
            "batch_lot_number",
            name="uq_biochar_batches_project_lot",
        ),
    )

    id = Column(
        String(36),
        primary_key=True,
        default=_generate_uuid,
        comment="UUID v4 batch identifier",
    )
    project_id = Column(
        String(36),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        comment="FK → projects.id",
    )
    batch_lot_number = Column(
        String(128),
        nullable=False,
        index=True,
        comment="Lot number, unique within its parent project",
    )
    status = Column(
        Enum(BatchStatus, name="batch_status_enum", create_constraint=True),
        nullable=False,
        default=BatchStatus.sourcing_purgatory,
        comment="Current lifecycle state of the batch",
    )
    net_sequestration_tco2e = Column(
        Float,
        nullable=False,
        default=0.0,
        server_default=text("0.0"),
        comment="Net carbon dioxide removal (tCO₂e)",
    )
    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=_utcnow,
        comment="Row creation timestamp (UTC)",
    )
    updated_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=_utcnow,
        onupdate=_utcnow,
        comment="Last modification timestamp (UTC)",
    )

    # ── relationships ────────────────────────────────────────────────────
    project = relationship(
        "Project",
        back_populates="biochar_batches",
    )
    feedstock_ingests = relationship(
        "FeedstockIngest",
        back_populates="batch",
        cascade="all, delete-orphan",
        lazy="selectin",
    )
    pyrolysis_telemetry = relationship(
        "PyrolysisTelemetry",
        back_populates="batch",
        cascade="all, delete-orphan",
        lazy="selectin",
    )
    lab_assay = relationship(
        "LabAssay",
        back_populates="batch",
        uselist=False,
        cascade="all, delete-orphan",
        lazy="selectin",
    )
    distribution_sinks = relationship(
        "DistributionSink",
        back_populates="batch",
        cascade="all, delete-orphan",
        lazy="selectin",
    )

    def __repr__(self) -> str:
        return (
            f"<BiocharBatch id={self.id!r} "
            f"lot={self.batch_lot_number!r} "
            f"status={self.status!r}>"
        )


# ──────────────────────────────────────────────────────────────────────────────
# FeedstockIngest
# ──────────────────────────────────────────────────────────────────────────────

class FeedstockIngest(Base):
    """
    A single feedstock intake event for a biochar batch.

    Tracks the origin GPS coordinates, mass, and whether the source parcel
    passed satellite-based deforestation / land-clearance screening.
    """
    __tablename__ = "feedstock_ingests"

    id = Column(
        String(36),
        primary_key=True,
        default=_generate_uuid,
        comment="UUID v4 ingest record identifier",
    )
    batch_id = Column(
        String(36),
        ForeignKey("biochar_batches.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        comment="FK → biochar_batches.id",
    )
    feedstock_type = Column(
        Enum(FeedstockType, name="feedstock_type_enum", create_constraint=True),
        nullable=False,
        comment="Biomass category (rice_husk | wood_residue | coffee_hulls)",
    )
    source_latitude = Column(
        Float,
        nullable=False,
        comment="Origin GPS latitude (decimal degrees)",
    )
    source_longitude = Column(
        Float,
        nullable=False,
        comment="Origin GPS longitude (decimal degrees)",
    )
    wet_mass_tons = Column(
        Float,
        nullable=False,
        comment="Gross wet mass of the feedstock delivery (metric tonnes)",
    )
    satellite_clearance_status = Column(
        Boolean,
        nullable=False,
        default=False,
        server_default=text("FALSE"),
        comment="True if satellite land-clearance screening passed",
    )
    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=_utcnow,
        comment="Row creation timestamp (UTC)",
    )

    # ── relationships ────────────────────────────────────────────────────
    batch = relationship(
        "BiocharBatch",
        back_populates="feedstock_ingests",
    )

    def __repr__(self) -> str:
        return (
            f"<FeedstockIngest id={self.id!r} "
            f"type={self.feedstock_type!r} "
            f"mass={self.wet_mass_tons}t>"
        )


# ──────────────────────────────────────────────────────────────────────────────
# PyrolysisTelemetry
# ──────────────────────────────────────────────────────────────────────────────

class PyrolysisTelemetry(Base):
    """
    High-frequency SCADA / PLC telemetry row captured during pyrolysis.

    Uses a BigInteger auto-increment PK to support high-throughput inserts
    without UUID generation overhead.  The ``timestamp`` column carries a
    database-level index for efficient chronological range queries.
    """
    __tablename__ = "pyrolysis_telemetry"
    __table_args__ = (
        Index("ix_pyrolysis_telemetry_timestamp", "timestamp"),
    )

    id = Column(
        BigInteger().with_variant(Integer, "sqlite"),
        primary_key=True,
        autoincrement=True,
        comment="Auto-increment telemetry row identifier",
    )
    batch_id = Column(
        String(36),
        ForeignKey("biochar_batches.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        comment="FK → biochar_batches.id",
    )
    timestamp = Column(
        DateTime(timezone=True),
        nullable=False,
        comment="Sensor reading wall-clock time (indexed)",
    )
    kiln_temperature_celsius = Column(
        Float,
        nullable=False,
        comment="Kiln internal temperature at reading time (°C)",
    )
    electricity_consumption_kwh = Column(
        Float,
        nullable=False,
        comment="Cumulative grid electricity draw since last reading (kWh)",
    )
    fossil_fuel_consumption_liters = Column(
        Float,
        nullable=False,
        comment="Fossil-fuel consumption since last reading (litres)",
    )

    # ── relationships ────────────────────────────────────────────────────
    batch = relationship(
        "BiocharBatch",
        back_populates="pyrolysis_telemetry",
    )

    def __repr__(self) -> str:
        return (
            f"<PyrolysisTelemetry id={self.id} "
            f"batch={self.batch_id!r} "
            f"temp={self.kiln_temperature_celsius}°C>"
        )


# ──────────────────────────────────────────────────────────────────────────────
# LabAssay
# ──────────────────────────────────────────────────────────────────────────────

class LabAssay(Base):
    """
    Laboratory chemical analysis results for a biochar batch.

    Exactly one assay row per batch (unique constraint on ``batch_id``).
    """
    __tablename__ = "lab_assays"
    __table_args__ = (
        UniqueConstraint("batch_id", name="uq_lab_assays_batch_id"),
    )

    id = Column(
        String(36),
        primary_key=True,
        default=_generate_uuid,
        comment="UUID v4 assay record identifier",
    )
    batch_id = Column(
        String(36),
        ForeignKey("biochar_batches.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        comment="FK → biochar_batches.id (unique per batch)",
    )
    organic_carbon_percentage = Column(
        Float,
        nullable=False,
        comment="Organic carbon fraction (0–100 %)",
    )
    molar_hc_ratio = Column(
        Float,
        nullable=False,
        comment="Molar hydrogen-to-carbon ratio (H:C)",
    )
    verification_tier = Column(
        Enum(
            VerificationTier,
            name="verification_tier_enum",
            create_constraint=True,
        ),
        nullable=False,
        default=VerificationTier.pending,
        comment="Permanence classification tier",
    )
    certificate_hash = Column(
        String(64),
        nullable=False,
        comment="SHA-256 hex digest of the laboratory certificate document",
    )
    uploaded_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=_utcnow,
        comment="Timestamp when assay results were uploaded (UTC)",
    )

    # ── relationships ────────────────────────────────────────────────────
    batch = relationship(
        "BiocharBatch",
        back_populates="lab_assay",
    )

    def __repr__(self) -> str:
        return (
            f"<LabAssay id={self.id!r} "
            f"batch={self.batch_id!r} "
            f"H:C={self.molar_hc_ratio}>"
        )


# ──────────────────────────────────────────────────────────────────────────────
# DistributionSink
# ──────────────────────────────────────────────────────────────────────────────

class DistributionSink(Base):
    """
    Outbound delivery record — tracks where processed biochar was applied
    (the carbon "sink").  Nullable geo-fields support browser geotag capture
    at the point of delivery.
    """
    __tablename__ = "distribution_sinks"

    id = Column(
        String(36),
        primary_key=True,
        default=_generate_uuid,
        comment="UUID v4 distribution record identifier",
    )
    batch_id = Column(
        String(36),
        ForeignKey("biochar_batches.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        comment="FK → biochar_batches.id",
    )
    delivery_ticket_id = Column(
        String(128),
        nullable=False,
        unique=True,
        index=True,
        comment="Outbound invoice / delivery ticket number (globally unique)",
    )
    farmer_id = Column(
        String(128),
        nullable=False,
        comment="End-user / farmer identifier",
    )
    shipped_mass_tons = Column(
        Float,
        nullable=False,
        comment="Mass of biochar shipped (metric tonnes)",
    )
    sink_latitude = Column(
        Float,
        nullable=True,
        comment="Delivery-site GPS latitude (browser geotag, nullable)",
    )
    sink_longitude = Column(
        Float,
        nullable=True,
        comment="Delivery-site GPS longitude (browser geotag, nullable)",
    )
    photo_evidence_url = Column(
        String(512),
        nullable=True,
        comment="Storage bucket path / URL for delivery photo evidence",
    )
    attestation_timestamp = Column(
        DateTime(timezone=True),
        nullable=True,
        comment="Timestamp when the delivery attestation was recorded",
    )

    # ── relationships ────────────────────────────────────────────────────
    batch = relationship(
        "BiocharBatch",
        back_populates="distribution_sinks",
    )

    def __repr__(self) -> str:
        return (
            f"<DistributionSink id={self.id!r} "
            f"ticket={self.delivery_ticket_id!r} "
            f"mass={self.shipped_mass_tons}t>"
        )


# ──────────────────────────────────────────────────────────────────────────────
# SQLite FK enforcement
# ──────────────────────────────────────────────────────────────────────────────

@event.listens_for(Base.metadata, "after_create")
def _set_sqlite_pragma(target, connection, **kwargs):
    """Enable foreign-key checks for SQLite (off by default)."""
    if connection.dialect.name == "sqlite":
        connection.execute(text("PRAGMA foreign_keys = ON"))
