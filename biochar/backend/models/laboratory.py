"""
biochar/backend/models/laboratory.py
──────────────────────────────────────────────────────────────────────────────
Laboratory domain models.

Tables: laboratories, biochar_samples, laboratory_tests,
        laboratory_parameters, laboratory_results,
        laboratory_certificates, laboratory_approvals
──────────────────────────────────────────────────────────────────────────────
"""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Optional

from sqlalchemy import Boolean, Date, Float, ForeignKey, String, Text, text
from sqlalchemy.dialects.postgresql import UUID as pgUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from biochar.backend.models.base import Base, TimestampMixin, UUIDMixin


# ──────────────────────────────────────────────────────────────────────────────
# Laboratory
# ──────────────────────────────────────────────────────────────────────────────


class Laboratory(UUIDMixin, TimestampMixin, Base):
    """Accredited laboratory entity."""

    __tablename__ = "laboratories"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    accreditation: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    contact_email: Mapped[Optional[str]] = mapped_column(String(320), nullable=True)
    contact_phone: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    address: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    country: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    website: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, server_default=text("true"), nullable=False)

    # relationships
    samples: Mapped[list["BiocharSample"]] = relationship(back_populates="laboratory")
    certificates: Mapped[list["LaboratoryCertificate"]] = relationship(back_populates="laboratory")

    def __repr__(self) -> str:
        return f"<Laboratory id={self.id!r} name={self.name!r}>"


# ──────────────────────────────────────────────────────────────────────────────
# BiocharSample
# ──────────────────────────────────────────────────────────────────────────────


class BiocharSample(UUIDMixin, TimestampMixin, Base):
    """A biochar sample sent to a laboratory for analysis."""

    __tablename__ = "biochar_samples"

    biochar_batch_id: Mapped[uuid.UUID] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("biochar_batches.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    laboratory_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("laboratories.id", ondelete="SET NULL"),
        nullable=True,
    )
    sample_number: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    collected_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("profiles.id", ondelete="SET NULL"),
        nullable=True,
    )
    collection_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    received_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(
        String(50), server_default=text("'pending'"), nullable=False
    )
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # relationships
    laboratory: Mapped[Optional["Laboratory"]] = relationship(back_populates="samples")
    tests: Mapped[list["LaboratoryTest"]] = relationship(back_populates="sample")

    def __repr__(self) -> str:
        return f"<BiocharSample id={self.id!r} sample_number={self.sample_number!r}>"


# ──────────────────────────────────────────────────────────────────────────────
# LaboratoryTest
# ──────────────────────────────────────────────────────────────────────────────


class LaboratoryTest(UUIDMixin, TimestampMixin, Base):
    """A specific test run on a biochar sample."""

    __tablename__ = "laboratory_tests"

    sample_id: Mapped[uuid.UUID] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("biochar_samples.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    test_type: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    method: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    test_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(
        String(50), server_default=text("'pending'"), nullable=False
    )
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # relationships
    sample: Mapped["BiocharSample"] = relationship(back_populates="tests")
    results: Mapped[list["LaboratoryResult"]] = relationship(back_populates="test")

    def __repr__(self) -> str:
        return f"<LaboratoryTest id={self.id!r} type={self.test_type!r}>"


# ──────────────────────────────────────────────────────────────────────────────
# LaboratoryParameter
# ──────────────────────────────────────────────────────────────────────────────


class LaboratoryParameter(UUIDMixin, TimestampMixin, Base):
    """Catalogue of measurable parameters (e.g. organic carbon %, H:C ratio)."""

    __tablename__ = "laboratory_parameters"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    unit: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    min_value: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    max_value: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    is_required: Mapped[bool] = mapped_column(Boolean, server_default=text("false"), nullable=False)

    # relationships
    results: Mapped[list["LaboratoryResult"]] = relationship(back_populates="parameter")

    def __repr__(self) -> str:
        return f"<LaboratoryParameter id={self.id!r} name={self.name!r}>"


# ──────────────────────────────────────────────────────────────────────────────
# LaboratoryResult
# ──────────────────────────────────────────────────────────────────────────────


class LaboratoryResult(UUIDMixin, TimestampMixin, Base):
    """Individual measurement result for a test × parameter."""

    __tablename__ = "laboratory_results"

    test_id: Mapped[uuid.UUID] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("laboratory_tests.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    parameter_id: Mapped[uuid.UUID] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("laboratory_parameters.id", ondelete="CASCADE"),
        nullable=False,
    )
    value: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    text_value: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    passed: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)

    # relationships
    test: Mapped["LaboratoryTest"] = relationship(back_populates="results")
    parameter: Mapped["LaboratoryParameter"] = relationship(back_populates="results")

    def __repr__(self) -> str:
        return f"<LaboratoryResult id={self.id!r} value={self.value}>"


# ──────────────────────────────────────────────────────────────────────────────
# LaboratoryCertificate
# ──────────────────────────────────────────────────────────────────────────────


class LaboratoryCertificate(UUIDMixin, TimestampMixin, Base):
    """Official certificate issued by a laboratory for a biochar batch."""

    __tablename__ = "laboratory_certificates"

    biochar_batch_id: Mapped[uuid.UUID] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("biochar_batches.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    laboratory_id: Mapped[uuid.UUID] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("laboratories.id", ondelete="CASCADE"),
        nullable=False,
    )
    certificate_number: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    certificate_hash: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    issue_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    expiry_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    file_url: Mapped[Optional[str]] = mapped_column(String(1024), nullable=True)
    organic_carbon_pct: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    molar_hc_ratio: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    verification_tier: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    status: Mapped[str] = mapped_column(
        String(50), server_default=text("'pending'"), nullable=False
    )

    # relationships
    laboratory: Mapped["Laboratory"] = relationship(back_populates="certificates")
    approvals: Mapped[list["LaboratoryApproval"]] = relationship(back_populates="certificate")

    def __repr__(self) -> str:
        return f"<LaboratoryCertificate id={self.id!r} number={self.certificate_number!r}>"


# ──────────────────────────────────────────────────────────────────────────────
# LaboratoryApproval
# ──────────────────────────────────────────────────────────────────────────────


class LaboratoryApproval(UUIDMixin, TimestampMixin, Base):
    """Approval / sign-off on a laboratory certificate."""

    __tablename__ = "laboratory_approvals"

    certificate_id: Mapped[uuid.UUID] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("laboratory_certificates.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    approved_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("profiles.id", ondelete="SET NULL"),
        nullable=True,
    )
    decision: Mapped[str] = mapped_column(
        String(50), server_default=text("'pending'"), nullable=False
    )
    comments: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    decision_date: Mapped[Optional[datetime]] = mapped_column(nullable=True)

    # relationships
    certificate: Mapped["LaboratoryCertificate"] = relationship(back_populates="approvals")

    def __repr__(self) -> str:
        return f"<LaboratoryApproval id={self.id!r} decision={self.decision!r}>"
