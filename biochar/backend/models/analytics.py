"""
biochar/backend/models/analytics.py
──────────────────────────────────────────────────────────────────────────────
Analytics & Reporting Dashboard domain models.

Tables: kpi_definitions, organization_kpis, dashboard_widgets,
        saved_reports, report_exports, dashboard_snapshots,
        activity_timeline, performance_metrics
──────────────────────────────────────────────────────────────────────────────
"""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Optional

from sqlalchemy import Boolean, Date, Float, ForeignKey, Integer, String, Text, text
from sqlalchemy.dialects.postgresql import UUID as pgUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from biochar.backend.models.base import Base, TimestampMixin, UUIDMixin


# ──────────────────────────────────────────────────────────────────────────────
# KPIDefinition
# ──────────────────────────────────────────────────────────────────────────────


class KPIDefinition(UUIDMixin, TimestampMixin, Base):
    """System-defined or custom KPI metric definition."""

    __tablename__ = "kpi_definitions"

    name: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    category: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    unit: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    calculation_sql: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, server_default=text("true"), nullable=False)

    # relationships
    organization_kpis: Mapped[list["OrganizationKPI"]] = relationship(
        back_populates="kpi_definition"
    )

    def __repr__(self) -> str:
        return f"<KPIDefinition id={self.id!r} name={self.name!r}>"


# ──────────────────────────────────────────────────────────────────────────────
# OrganizationKPI
# ──────────────────────────────────────────────────────────────────────────────


class OrganizationKPI(UUIDMixin, TimestampMixin, Base):
    """Target and calculated value for an organisation KPI."""

    __tablename__ = "organization_kpis"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    kpi_definition_id: Mapped[uuid.UUID] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("kpi_definitions.id", ondelete="CASCADE"),
        nullable=False,
    )
    target_value: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    current_value: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    period_start: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    period_end: Mapped[Optional[date]] = mapped_column(Date, nullable=True)

    # relationships
    kpi_definition: Mapped["KPIDefinition"] = relationship(back_populates="organization_kpis")

    def __repr__(self) -> str:
        return f"<OrganizationKPI id={self.id!r}>"


# ──────────────────────────────────────────────────────────────────────────────
# DashboardWidget
# ──────────────────────────────────────────────────────────────────────────────


class DashboardWidget(UUIDMixin, TimestampMixin, Base):
    """Custom dashboard widget configuration for a user profile."""

    __tablename__ = "dashboard_widgets"

    profile_id: Mapped[uuid.UUID] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("profiles.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    widget_type: Mapped[str] = mapped_column(String(100), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    config_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    layout_x: Mapped[int] = mapped_column(Integer, server_default=text("0"), nullable=False)
    layout_y: Mapped[int] = mapped_column(Integer, server_default=text("0"), nullable=False)
    layout_w: Mapped[int] = mapped_column(Integer, server_default=text("4"), nullable=False)
    layout_h: Mapped[int] = mapped_column(Integer, server_default=text("3"), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, server_default=text("true"), nullable=False)

    def __repr__(self) -> str:
        return f"<DashboardWidget id={self.id!r} title={self.title!r}>"


# ──────────────────────────────────────────────────────────────────────────────
# SavedReport
# ──────────────────────────────────────────────────────────────────────────────


class SavedReport(UUIDMixin, TimestampMixin, Base):
    """Saved custom analytics report configuration."""

    __tablename__ = "saved_reports"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    created_by: Mapped[uuid.UUID] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("profiles.id", ondelete="CASCADE"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    report_type: Mapped[str] = mapped_column(String(100), nullable=False)
    query_params: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_shared: Mapped[bool] = mapped_column(Boolean, server_default=text("false"), nullable=False)

    # relationships
    exports: Mapped[list["ReportExport"]] = relationship(back_populates="saved_report")

    def __repr__(self) -> str:
        return f"<SavedReport id={self.id!r} name={self.name!r}>"


# ──────────────────────────────────────────────────────────────────────────────
# ReportExport
# ──────────────────────────────────────────────────────────────────────────────


class ReportExport(UUIDMixin, TimestampMixin, Base):
    """Exported snapshot/file of a saved report."""

    __tablename__ = "report_exports"

    saved_report_id: Mapped[uuid.UUID] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("saved_reports.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    exported_by: Mapped[uuid.UUID] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("profiles.id", ondelete="CASCADE"),
        nullable=False,
    )
    format: Mapped[str] = mapped_column(
        String(20), server_default=text("'csv'"), nullable=False
    )
    file_url: Mapped[Optional[str]] = mapped_column(String(1024), nullable=True)
    status: Mapped[str] = mapped_column(
        String(50), server_default=text("'completed'"), nullable=False
    )

    # relationships
    saved_report: Mapped["SavedReport"] = relationship(back_populates="exports")

    def __repr__(self) -> str:
        return f"<ReportExport id={self.id!r} format={self.format!r}>"


# ──────────────────────────────────────────────────────────────────────────────
# DashboardSnapshot
# ──────────────────────────────────────────────────────────────────────────────


class DashboardSnapshot(UUIDMixin, TimestampMixin, Base):
    """Periodically captured snapshot of dashboard metrics."""

    __tablename__ = "dashboard_snapshots"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    snapshot_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    metrics_json: Mapped[str] = mapped_column(Text, nullable=False)
    total_sequestration_tco2e: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    total_batches: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    active_projects: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    def __repr__(self) -> str:
        return f"<DashboardSnapshot id={self.id!r} date={self.snapshot_date}>"


# ──────────────────────────────────────────────────────────────────────────────
# ActivityTimeline
# ──────────────────────────────────────────────────────────────────────────────


class ActivityTimeline(UUIDMixin, Base):
    """Chronological user/system activity feed for an organisation."""

    __tablename__ = "activity_timeline"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    profile_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("profiles.id", ondelete="SET NULL"),
        nullable=True,
    )
    activity_type: Mapped[str] = mapped_column(String(100), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    resource_type: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    resource_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    timestamp: Mapped[datetime] = mapped_column(
        server_default=text("now()"),
        nullable=False,
        index=True,
    )

    def __repr__(self) -> str:
        return f"<ActivityTimeline id={self.id!r} type={self.activity_type!r}>"


# ──────────────────────────────────────────────────────────────────────────────
# PerformanceMetric
# ──────────────────────────────────────────────────────────────────────────────


class PerformanceMetric(UUIDMixin, TimestampMixin, Base):
    """Aggregated operational performance metrics."""

    __tablename__ = "performance_metrics"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    metric_category: Mapped[str] = mapped_column(String(100), nullable=False)
    metric_name: Mapped[str] = mapped_column(String(255), nullable=False)
    value: Mapped[float] = mapped_column(Float, nullable=False)
    unit: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    recorded_at: Mapped[datetime] = mapped_column(
        server_default=text("now()"),
        nullable=False,
        index=True,
    )

    def __repr__(self) -> str:
        return f"<PerformanceMetric id={self.id!r} name={self.metric_name!r}>"
