"""
biochar/backend/models/registry.py
──────────────────────────────────────────────────────────────────────────────
Registry & Reporting domain models.

Tables: registries, registry_methodologies, registry_reports,
        report_sections, report_attachments, report_submissions,
        report_versions
──────────────────────────────────────────────────────────────────────────────
"""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Optional

from sqlalchemy import Boolean, Date, ForeignKey, Integer, String, Text, text
from sqlalchemy.dialects.postgresql import UUID as pgUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from biochar.backend.models.base import Base, TimestampMixin, UUIDMixin


# ──────────────────────────────────────────────────────────────────────────────
# Registry
# ──────────────────────────────────────────────────────────────────────────────


class Registry(UUIDMixin, TimestampMixin, Base):
    """Carbon credit registry entity (Verra, Gold Standard, etc.)."""

    __tablename__ = "registries"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    website: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    country: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, server_default=text("true"), nullable=False)

    # relationships
    methodologies: Mapped[list["RegistryMethodology"]] = relationship(back_populates="registry")
    reports: Mapped[list["RegistryReport"]] = relationship(back_populates="registry")

    def __repr__(self) -> str:
        return f"<Registry id={self.id!r} name={self.name!r}>"


# ──────────────────────────────────────────────────────────────────────────────
# RegistryMethodology
# ──────────────────────────────────────────────────────────────────────────────


class RegistryMethodology(UUIDMixin, TimestampMixin, Base):
    """Methodology approved by a registry."""

    __tablename__ = "registry_methodologies"

    registry_id: Mapped[uuid.UUID] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("registries.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    version: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    code: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    document_url: Mapped[Optional[str]] = mapped_column(String(1024), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, server_default=text("true"), nullable=False)

    # relationships
    registry: Mapped["Registry"] = relationship(back_populates="methodologies")

    def __repr__(self) -> str:
        return f"<RegistryMethodology id={self.id!r} name={self.name!r}>"


# ──────────────────────────────────────────────────────────────────────────────
# RegistryReport
# ──────────────────────────────────────────────────────────────────────────────


class RegistryReport(UUIDMixin, TimestampMixin, Base):
    """Report submitted to a registry for a project."""

    __tablename__ = "registry_reports"

    registry_id: Mapped[uuid.UUID] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("registries.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
    )
    report_type: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    title: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    status: Mapped[str] = mapped_column(
        String(50), server_default=text("'draft'"), nullable=False
    )
    prepared_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("profiles.id", ondelete="SET NULL"),
        nullable=True,
    )
    due_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # relationships
    registry: Mapped["Registry"] = relationship(back_populates="reports")
    sections: Mapped[list["ReportSection"]] = relationship(back_populates="report")
    attachments: Mapped[list["ReportAttachment"]] = relationship(back_populates="report")
    submissions: Mapped[list["ReportSubmission"]] = relationship(back_populates="report")
    versions: Mapped[list["ReportVersion"]] = relationship(back_populates="report")

    def __repr__(self) -> str:
        return f"<RegistryReport id={self.id!r} title={self.title!r}>"


# ──────────────────────────────────────────────────────────────────────────────
# ReportSection
# ──────────────────────────────────────────────────────────────────────────────


class ReportSection(UUIDMixin, TimestampMixin, Base):
    """Section within a registry report."""

    __tablename__ = "report_sections"

    report_id: Mapped[uuid.UUID] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("registry_reports.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    content: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    sort_order: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    status: Mapped[str] = mapped_column(
        String(50), server_default=text("'draft'"), nullable=False
    )

    # relationships
    report: Mapped["RegistryReport"] = relationship(back_populates="sections")

    def __repr__(self) -> str:
        return f"<ReportSection id={self.id!r} title={self.title!r}>"


# ──────────────────────────────────────────────────────────────────────────────
# ReportAttachment
# ──────────────────────────────────────────────────────────────────────────────


class ReportAttachment(UUIDMixin, TimestampMixin, Base):
    """File attachment for a registry report."""

    __tablename__ = "report_attachments"

    report_id: Mapped[uuid.UUID] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("registry_reports.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    file_url: Mapped[str] = mapped_column(String(1024), nullable=False)
    file_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    file_type: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # relationships
    report: Mapped["RegistryReport"] = relationship(back_populates="attachments")

    def __repr__(self) -> str:
        return f"<ReportAttachment id={self.id!r} name={self.file_name!r}>"


# ──────────────────────────────────────────────────────────────────────────────
# ReportSubmission
# ──────────────────────────────────────────────────────────────────────────────


class ReportSubmission(UUIDMixin, TimestampMixin, Base):
    """Submission record of a report to its registry."""

    __tablename__ = "report_submissions"

    report_id: Mapped[uuid.UUID] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("registry_reports.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    submitted_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("profiles.id", ondelete="SET NULL"),
        nullable=True,
    )
    submission_date: Mapped[Optional[datetime]] = mapped_column(nullable=True)
    reference_number: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    status: Mapped[str] = mapped_column(
        String(50), server_default=text("'submitted'"), nullable=False
    )
    response_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # relationships
    report: Mapped["RegistryReport"] = relationship(back_populates="submissions")

    def __repr__(self) -> str:
        return f"<ReportSubmission id={self.id!r} status={self.status!r}>"


# ──────────────────────────────────────────────────────────────────────────────
# ReportVersion
# ──────────────────────────────────────────────────────────────────────────────


class ReportVersion(UUIDMixin, TimestampMixin, Base):
    """Version history of a registry report."""

    __tablename__ = "report_versions"

    report_id: Mapped[uuid.UUID] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("registry_reports.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    version_number: Mapped[int] = mapped_column(Integer, nullable=False)
    change_summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    changed_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("profiles.id", ondelete="SET NULL"),
        nullable=True,
    )
    file_url: Mapped[Optional[str]] = mapped_column(String(1024), nullable=True)

    # relationships
    report: Mapped["RegistryReport"] = relationship(back_populates="versions")

    def __repr__(self) -> str:
        return f"<ReportVersion id={self.id!r} v={self.version_number}>"
