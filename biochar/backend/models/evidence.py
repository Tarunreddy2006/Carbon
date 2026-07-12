"""
biochar/backend/models/evidence.py
──────────────────────────────────────────────────────────────────────────────
Evidence & Documentation domain models.

Tables: evidence_types, evidence, evidence_files, gps_records,
        photo_metadata, digital_signatures, evidence_reviews
──────────────────────────────────────────────────────────────────────────────
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, Float, ForeignKey, Integer, String, Text, text
from sqlalchemy.dialects.postgresql import UUID as pgUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from biochar.backend.models.base import Base, TimestampMixin, UUIDMixin


# ──────────────────────────────────────────────────────────────────────────────
# EvidenceType
# ──────────────────────────────────────────────────────────────────────────────


class EvidenceType(UUIDMixin, TimestampMixin, Base):
    """Catalogue of evidence categories (photo, document, GPS, etc.)."""

    __tablename__ = "evidence_types"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    category: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_required: Mapped[bool] = mapped_column(Boolean, server_default=text("false"), nullable=False)

    # relationships
    evidence_records: Mapped[list["Evidence"]] = relationship(back_populates="evidence_type")

    def __repr__(self) -> str:
        return f"<EvidenceType id={self.id!r} name={self.name!r}>"


# ──────────────────────────────────────────────────────────────────────────────
# Evidence
# ──────────────────────────────────────────────────────────────────────────────


class Evidence(UUIDMixin, TimestampMixin, Base):
    """An evidence record attached to a project or batch."""

    __tablename__ = "evidence"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    evidence_type_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("evidence_types.id", ondelete="SET NULL"),
        nullable=True,
    )
    project_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="SET NULL"),
        nullable=True,
    )
    biochar_batch_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("biochar_batches.id", ondelete="SET NULL"),
        nullable=True,
    )
    title: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    collected_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("profiles.id", ondelete="SET NULL"),
        nullable=True,
    )
    collected_at: Mapped[Optional[datetime]] = mapped_column(nullable=True)
    status: Mapped[str] = mapped_column(
        String(50), server_default=text("'draft'"), nullable=False
    )

    # relationships
    evidence_type: Mapped[Optional["EvidenceType"]] = relationship(back_populates="evidence_records")
    files: Mapped[list["EvidenceFile"]] = relationship(back_populates="evidence")
    gps_records: Mapped[list["GPSRecord"]] = relationship(back_populates="evidence")
    reviews: Mapped[list["EvidenceReview"]] = relationship(back_populates="evidence")

    def __repr__(self) -> str:
        return f"<Evidence id={self.id!r} title={self.title!r}>"


# ──────────────────────────────────────────────────────────────────────────────
# EvidenceFile
# ──────────────────────────────────────────────────────────────────────────────


class EvidenceFile(UUIDMixin, TimestampMixin, Base):
    """File attachment for an evidence record."""

    __tablename__ = "evidence_files"

    evidence_id: Mapped[uuid.UUID] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("evidence.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    file_url: Mapped[str] = mapped_column(String(1024), nullable=False)
    file_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    file_type: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    file_size_bytes: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    checksum: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)

    # relationships
    evidence: Mapped["Evidence"] = relationship(back_populates="files")
    photo_metadata: Mapped[Optional["PhotoMetadata"]] = relationship(
        back_populates="evidence_file", uselist=False
    )

    def __repr__(self) -> str:
        return f"<EvidenceFile id={self.id!r} name={self.file_name!r}>"


# ──────────────────────────────────────────────────────────────────────────────
# GPSRecord
# ──────────────────────────────────────────────────────────────────────────────


class GPSRecord(UUIDMixin, TimestampMixin, Base):
    """GPS coordinate captured as part of evidence."""

    __tablename__ = "gps_records"

    evidence_id: Mapped[uuid.UUID] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("evidence.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    altitude_m: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    accuracy_m: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    captured_at: Mapped[Optional[datetime]] = mapped_column(nullable=True)
    device_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    # relationships
    evidence: Mapped["Evidence"] = relationship(back_populates="gps_records")

    def __repr__(self) -> str:
        return f"<GPSRecord id={self.id!r} lat={self.latitude} lng={self.longitude}>"


# ──────────────────────────────────────────────────────────────────────────────
# PhotoMetadata
# ──────────────────────────────────────────────────────────────────────────────


class PhotoMetadata(UUIDMixin, TimestampMixin, Base):
    """EXIF / metadata extracted from a photo evidence file."""

    __tablename__ = "photo_metadata"

    evidence_file_id: Mapped[uuid.UUID] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("evidence_files.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    latitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    longitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    altitude_m: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    taken_at: Mapped[Optional[datetime]] = mapped_column(nullable=True)
    camera_make: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    camera_model: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    image_width: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    image_height: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    # relationships
    evidence_file: Mapped["EvidenceFile"] = relationship(back_populates="photo_metadata")

    def __repr__(self) -> str:
        return f"<PhotoMetadata id={self.id!r}>"


# ──────────────────────────────────────────────────────────────────────────────
# DigitalSignature
# ──────────────────────────────────────────────────────────────────────────────


class DigitalSignature(UUIDMixin, TimestampMixin, Base):
    """Cryptographic signature for evidence integrity."""

    __tablename__ = "digital_signatures"

    evidence_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("evidence.id", ondelete="SET NULL"),
        nullable=True,
    )
    signer_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("profiles.id", ondelete="SET NULL"),
        nullable=True,
    )
    algorithm: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    signature_hash: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    public_key: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    signed_at: Mapped[Optional[datetime]] = mapped_column(nullable=True)
    is_valid: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)

    def __repr__(self) -> str:
        return f"<DigitalSignature id={self.id!r} valid={self.is_valid}>"


# ──────────────────────────────────────────────────────────────────────────────
# EvidenceReview
# ──────────────────────────────────────────────────────────────────────────────


class EvidenceReview(UUIDMixin, TimestampMixin, Base):
    """Review / approval of an evidence record."""

    __tablename__ = "evidence_reviews"

    evidence_id: Mapped[uuid.UUID] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("evidence.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    reviewer_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("profiles.id", ondelete="SET NULL"),
        nullable=True,
    )
    decision: Mapped[str] = mapped_column(
        String(50), server_default=text("'pending'"), nullable=False
    )
    comments: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(nullable=True)

    # relationships
    evidence: Mapped["Evidence"] = relationship(back_populates="reviews")

    def __repr__(self) -> str:
        return f"<EvidenceReview id={self.id!r} decision={self.decision!r}>"
