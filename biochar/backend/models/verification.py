"""
biochar/backend/models/verification.py
──────────────────────────────────────────────────────────────────────────────
Verification & Audit domain models.

Tables: verification_cases, verification_organizations, auditors,
        verification_assignments, verification_findings,
        finding_evidence, finding_responses,
        verification_corrective_actions, verification_decisions
──────────────────────────────────────────────────────────────────────────────
"""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Optional

from sqlalchemy import Boolean, Date, ForeignKey, String, Text, text
from sqlalchemy.dialects.postgresql import UUID as pgUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from biochar.backend.models.base import Base, TimestampMixin, UUIDMixin


# ──────────────────────────────────────────────────────────────────────────────
# VerificationCase
# ──────────────────────────────────────────────────────────────────────────────


class VerificationCase(UUIDMixin, TimestampMixin, Base):
    """A verification / audit case for a project."""

    __tablename__ = "verification_cases"

    project_id: Mapped[uuid.UUID] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    verification_org_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("verification_organizations.id", ondelete="SET NULL"),
        nullable=True,
    )
    case_number: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    status: Mapped[str] = mapped_column(
        String(50), server_default=text("'initiated'"), nullable=False
    )
    start_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    end_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    scope: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # relationships
    verification_org: Mapped[Optional["VerificationOrganization"]] = relationship(
        back_populates="cases"
    )
    assignments: Mapped[list["VerificationAssignment"]] = relationship(back_populates="case")
    findings: Mapped[list["VerificationFinding"]] = relationship(back_populates="case")
    decisions: Mapped[list["VerificationDecision"]] = relationship(back_populates="case")

    def __repr__(self) -> str:
        return f"<VerificationCase id={self.id!r} status={self.status!r}>"


# ──────────────────────────────────────────────────────────────────────────────
# VerificationOrganization
# ──────────────────────────────────────────────────────────────────────────────


class VerificationOrganization(UUIDMixin, TimestampMixin, Base):
    """Third-party verification / audit body."""

    __tablename__ = "verification_organizations"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    accreditation: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    contact_email: Mapped[Optional[str]] = mapped_column(String(320), nullable=True)
    website: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    country: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, server_default=text("true"), nullable=False)

    # relationships
    cases: Mapped[list["VerificationCase"]] = relationship(back_populates="verification_org")
    auditors: Mapped[list["Auditor"]] = relationship(back_populates="organization")

    def __repr__(self) -> str:
        return f"<VerificationOrganization id={self.id!r} name={self.name!r}>"


# ──────────────────────────────────────────────────────────────────────────────
# Auditor
# ──────────────────────────────────────────────────────────────────────────────


class Auditor(UUIDMixin, TimestampMixin, Base):
    """Individual auditor within a verification organisation."""

    __tablename__ = "auditors"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("verification_organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[Optional[str]] = mapped_column(String(320), nullable=True)
    qualifications: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_lead: Mapped[bool] = mapped_column(Boolean, server_default=text("false"), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, server_default=text("true"), nullable=False)

    # relationships
    organization: Mapped["VerificationOrganization"] = relationship(back_populates="auditors")
    assignments: Mapped[list["VerificationAssignment"]] = relationship(back_populates="auditor")

    def __repr__(self) -> str:
        return f"<Auditor id={self.id!r} name={self.name!r}>"


# ──────────────────────────────────────────────────────────────────────────────
# VerificationAssignment
# ──────────────────────────────────────────────────────────────────────────────


class VerificationAssignment(UUIDMixin, TimestampMixin, Base):
    """Assigns an auditor to a verification case."""

    __tablename__ = "verification_assignments"

    case_id: Mapped[uuid.UUID] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("verification_cases.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    auditor_id: Mapped[uuid.UUID] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("auditors.id", ondelete="CASCADE"),
        nullable=False,
    )
    role: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    assigned_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)

    # relationships
    case: Mapped["VerificationCase"] = relationship(back_populates="assignments")
    auditor: Mapped["Auditor"] = relationship(back_populates="assignments")

    def __repr__(self) -> str:
        return f"<VerificationAssignment id={self.id!r}>"


# ──────────────────────────────────────────────────────────────────────────────
# VerificationFinding
# ──────────────────────────────────────────────────────────────────────────────


class VerificationFinding(UUIDMixin, TimestampMixin, Base):
    """A finding raised during a verification case."""

    __tablename__ = "verification_findings"

    case_id: Mapped[uuid.UUID] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("verification_cases.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    finding_type: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    severity: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(
        String(50), server_default=text("'open'"), nullable=False
    )
    raised_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("auditors.id", ondelete="SET NULL"),
        nullable=True,
    )

    # relationships
    case: Mapped["VerificationCase"] = relationship(back_populates="findings")
    evidence_links: Mapped[list["FindingEvidence"]] = relationship(back_populates="finding")
    responses: Mapped[list["FindingResponse"]] = relationship(back_populates="finding")
    corrective_actions: Mapped[list["VerificationCorrectiveAction"]] = relationship(
        back_populates="finding"
    )

    def __repr__(self) -> str:
        return f"<VerificationFinding id={self.id!r} title={self.title!r}>"


# ──────────────────────────────────────────────────────────────────────────────
# FindingEvidence
# ──────────────────────────────────────────────────────────────────────────────


class FindingEvidence(UUIDMixin, TimestampMixin, Base):
    """Links evidence to a verification finding."""

    __tablename__ = "finding_evidence"

    finding_id: Mapped[uuid.UUID] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("verification_findings.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    evidence_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("evidence.id", ondelete="SET NULL"),
        nullable=True,
    )
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # relationships
    finding: Mapped["VerificationFinding"] = relationship(back_populates="evidence_links")

    def __repr__(self) -> str:
        return f"<FindingEvidence id={self.id!r}>"


# ──────────────────────────────────────────────────────────────────────────────
# FindingResponse
# ──────────────────────────────────────────────────────────────────────────────


class FindingResponse(UUIDMixin, TimestampMixin, Base):
    """Response from the project team to a verification finding."""

    __tablename__ = "finding_responses"

    finding_id: Mapped[uuid.UUID] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("verification_findings.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    responded_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("profiles.id", ondelete="SET NULL"),
        nullable=True,
    )
    response: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    response_date: Mapped[Optional[datetime]] = mapped_column(nullable=True)

    # relationships
    finding: Mapped["VerificationFinding"] = relationship(back_populates="responses")

    def __repr__(self) -> str:
        return f"<FindingResponse id={self.id!r}>"


# ──────────────────────────────────────────────────────────────────────────────
# VerificationCorrectiveAction
# ──────────────────────────────────────────────────────────────────────────────


class VerificationCorrectiveAction(UUIDMixin, TimestampMixin, Base):
    """Corrective action required by a verification finding."""

    __tablename__ = "verification_corrective_actions"

    finding_id: Mapped[uuid.UUID] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("verification_findings.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    due_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    completed_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(
        String(50), server_default=text("'pending'"), nullable=False
    )
    assigned_to: Mapped[Optional[uuid.UUID]] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("profiles.id", ondelete="SET NULL"),
        nullable=True,
    )

    # relationships
    finding: Mapped["VerificationFinding"] = relationship(back_populates="corrective_actions")

    def __repr__(self) -> str:
        return f"<VerificationCorrectiveAction id={self.id!r} status={self.status!r}>"


# ──────────────────────────────────────────────────────────────────────────────
# VerificationDecision
# ──────────────────────────────────────────────────────────────────────────────


class VerificationDecision(UUIDMixin, TimestampMixin, Base):
    """Final verification decision for a case."""

    __tablename__ = "verification_decisions"

    case_id: Mapped[uuid.UUID] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("verification_cases.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    decision: Mapped[str] = mapped_column(String(50), nullable=False)
    decision_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    decided_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("auditors.id", ondelete="SET NULL"),
        nullable=True,
    )
    rationale: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    credits_verified_tco2e: Mapped[Optional[float]] = mapped_column(nullable=True)
    certificate_url: Mapped[Optional[str]] = mapped_column(String(1024), nullable=True)

    # relationships
    case: Mapped["VerificationCase"] = relationship(back_populates="decisions")

    def __repr__(self) -> str:
        return f"<VerificationDecision id={self.id!r} decision={self.decision!r}>"
