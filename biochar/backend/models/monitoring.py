"""
biochar/backend/models/monitoring.py
──────────────────────────────────────────────────────────────────────────────
Monitoring domain models.

Tables: monitoring_plans, monitoring_events, monitoring_observations,
        monitoring_checklists, monitoring_issues, corrective_actions,
        monitoring_schedules
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
# MonitoringPlan
# ──────────────────────────────────────────────────────────────────────────────


class MonitoringPlan(UUIDMixin, TimestampMixin, Base):
    """Defines the monitoring strategy for a project."""

    __tablename__ = "monitoring_plans"

    project_id: Mapped[uuid.UUID] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    version: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    status: Mapped[str] = mapped_column(
        String(50), server_default=text("'draft'"), nullable=False
    )
    approved_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("profiles.id", ondelete="SET NULL"),
        nullable=True,
    )
    approved_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)

    # relationships
    events: Mapped[list["MonitoringEvent"]] = relationship(back_populates="plan")
    checklists: Mapped[list["MonitoringChecklist"]] = relationship(back_populates="plan")
    schedules: Mapped[list["MonitoringSchedule"]] = relationship(back_populates="plan")

    def __repr__(self) -> str:
        return f"<MonitoringPlan id={self.id!r} name={self.name!r}>"


# ──────────────────────────────────────────────────────────────────────────────
# MonitoringEvent
# ──────────────────────────────────────────────────────────────────────────────


class MonitoringEvent(UUIDMixin, TimestampMixin, Base):
    """A monitoring visit or inspection event."""

    __tablename__ = "monitoring_events"

    plan_id: Mapped[uuid.UUID] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("monitoring_plans.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    performed_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("profiles.id", ondelete="SET NULL"),
        nullable=True,
    )
    event_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    event_type: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    status: Mapped[str] = mapped_column(
        String(50), server_default=text("'scheduled'"), nullable=False
    )
    summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    latitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    longitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # relationships
    plan: Mapped["MonitoringPlan"] = relationship(back_populates="events")
    observations: Mapped[list["MonitoringObservation"]] = relationship(back_populates="event")
    issues: Mapped[list["MonitoringIssue"]] = relationship(back_populates="event")

    def __repr__(self) -> str:
        return f"<MonitoringEvent id={self.id!r} date={self.event_date}>"


# ──────────────────────────────────────────────────────────────────────────────
# MonitoringObservation
# ──────────────────────────────────────────────────────────────────────────────


class MonitoringObservation(UUIDMixin, TimestampMixin, Base):
    """Individual observation recorded during a monitoring event."""

    __tablename__ = "monitoring_observations"

    event_id: Mapped[uuid.UUID] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("monitoring_events.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    parameter: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    value: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    numeric_value: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    unit: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # relationships
    event: Mapped["MonitoringEvent"] = relationship(back_populates="observations")

    def __repr__(self) -> str:
        return f"<MonitoringObservation id={self.id!r} param={self.parameter!r}>"


# ──────────────────────────────────────────────────────────────────────────────
# MonitoringChecklist
# ──────────────────────────────────────────────────────────────────────────────


class MonitoringChecklist(UUIDMixin, TimestampMixin, Base):
    """Predefined checklist item within a monitoring plan."""

    __tablename__ = "monitoring_checklists"

    plan_id: Mapped[uuid.UUID] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("monitoring_plans.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    item: Mapped[str] = mapped_column(String(500), nullable=False)
    category: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    sort_order: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    is_required: Mapped[bool] = mapped_column(Boolean, server_default=text("false"), nullable=False)

    # relationships
    plan: Mapped["MonitoringPlan"] = relationship(back_populates="checklists")

    def __repr__(self) -> str:
        return f"<MonitoringChecklist id={self.id!r}>"


# ──────────────────────────────────────────────────────────────────────────────
# MonitoringIssue
# ──────────────────────────────────────────────────────────────────────────────


class MonitoringIssue(UUIDMixin, TimestampMixin, Base):
    """Issue / non-conformity identified during monitoring."""

    __tablename__ = "monitoring_issues"

    event_id: Mapped[uuid.UUID] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("monitoring_events.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    severity: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    status: Mapped[str] = mapped_column(
        String(50), server_default=text("'open'"), nullable=False
    )
    assigned_to: Mapped[Optional[uuid.UUID]] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("profiles.id", ondelete="SET NULL"),
        nullable=True,
    )
    due_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)

    # relationships
    event: Mapped["MonitoringEvent"] = relationship(back_populates="issues")
    corrective_actions: Mapped[list["CorrectiveAction"]] = relationship(back_populates="issue")

    def __repr__(self) -> str:
        return f"<MonitoringIssue id={self.id!r} title={self.title!r}>"


# ──────────────────────────────────────────────────────────────────────────────
# CorrectiveAction
# ──────────────────────────────────────────────────────────────────────────────


class CorrectiveAction(UUIDMixin, TimestampMixin, Base):
    """Corrective action taken to resolve a monitoring issue."""

    __tablename__ = "corrective_actions"

    issue_id: Mapped[uuid.UUID] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("monitoring_issues.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    assigned_to: Mapped[Optional[uuid.UUID]] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("profiles.id", ondelete="SET NULL"),
        nullable=True,
    )
    due_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    completed_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(
        String(50), server_default=text("'pending'"), nullable=False
    )

    # relationships
    issue: Mapped["MonitoringIssue"] = relationship(back_populates="corrective_actions")

    def __repr__(self) -> str:
        return f"<CorrectiveAction id={self.id!r} status={self.status!r}>"


# ──────────────────────────────────────────────────────────────────────────────
# MonitoringSchedule
# ──────────────────────────────────────────────────────────────────────────────


class MonitoringSchedule(UUIDMixin, TimestampMixin, Base):
    """Scheduled monitoring activity within a plan."""

    __tablename__ = "monitoring_schedules"

    plan_id: Mapped[uuid.UUID] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("monitoring_plans.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    frequency: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    next_due_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    responsible_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("profiles.id", ondelete="SET NULL"),
        nullable=True,
    )
    activity_type: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, server_default=text("true"), nullable=False)

    # relationships
    plan: Mapped["MonitoringPlan"] = relationship(back_populates="schedules")

    def __repr__(self) -> str:
        return f"<MonitoringSchedule id={self.id!r}>"
