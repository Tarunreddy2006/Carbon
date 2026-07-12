"""
biochar/backend/models/workflow.py
──────────────────────────────────────────────────────────────────────────────
Workflow & Notifications domain models.

Tables: notification_types, notifications, notification_preferences,
        tasks, task_comments, workflow_definitions, workflow_steps,
        workflow_executions, workflow_history
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
# NotificationType
# ──────────────────────────────────────────────────────────────────────────────


class NotificationType(UUIDMixin, TimestampMixin, Base):
    """Catalogue of notification event types."""

    __tablename__ = "notification_types"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    category: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    template: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, server_default=text("true"), nullable=False)

    # relationships
    notifications: Mapped[list["Notification"]] = relationship(back_populates="notification_type")
    preferences: Mapped[list["NotificationPreference"]] = relationship(back_populates="notification_type")

    def __repr__(self) -> str:
        return f"<NotificationType id={self.id!r} name={self.name!r}>"


# ──────────────────────────────────────────────────────────────────────────────
# Notification
# ──────────────────────────────────────────────────────────────────────────────


class Notification(UUIDMixin, TimestampMixin, Base):
    """User notification."""

    __tablename__ = "notifications"

    recipient_id: Mapped[uuid.UUID] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("profiles.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    notification_type_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("notification_types.id", ondelete="SET NULL"),
        nullable=True,
    )
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_read: Mapped[bool] = mapped_column(Boolean, server_default=text("false"), nullable=False)
    read_at: Mapped[Optional[datetime]] = mapped_column(nullable=True)
    link: Mapped[Optional[str]] = mapped_column(String(1024), nullable=True)

    # relationships
    notification_type: Mapped[Optional["NotificationType"]] = relationship(back_populates="notifications")

    def __repr__(self) -> str:
        return f"<Notification id={self.id!r} read={self.is_read}>"


# ──────────────────────────────────────────────────────────────────────────────
# NotificationPreference
# ──────────────────────────────────────────────────────────────────────────────


class NotificationPreference(UUIDMixin, TimestampMixin, Base):
    """User preference for a notification type."""

    __tablename__ = "notification_preferences"

    profile_id: Mapped[uuid.UUID] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("profiles.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    notification_type_id: Mapped[uuid.UUID] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("notification_types.id", ondelete="CASCADE"),
        nullable=False,
    )
    email_enabled: Mapped[bool] = mapped_column(Boolean, server_default=text("true"), nullable=False)
    in_app_enabled: Mapped[bool] = mapped_column(Boolean, server_default=text("true"), nullable=False)
    push_enabled: Mapped[bool] = mapped_column(Boolean, server_default=text("false"), nullable=False)

    # relationships
    notification_type: Mapped["NotificationType"] = relationship(back_populates="preferences")

    def __repr__(self) -> str:
        return f"<NotificationPreference id={self.id!r}>"


# ──────────────────────────────────────────────────────────────────────────────
# Task
# ──────────────────────────────────────────────────────────────────────────────


class Task(UUIDMixin, TimestampMixin, Base):
    """Actionable task within the platform."""

    __tablename__ = "tasks"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    project_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="SET NULL"),
        nullable=True,
    )
    assigned_to: Mapped[Optional[uuid.UUID]] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("profiles.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("profiles.id", ondelete="SET NULL"),
        nullable=True,
    )
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    priority: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    status: Mapped[str] = mapped_column(
        String(50), server_default=text("'open'"), nullable=False
    )
    due_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    completed_at: Mapped[Optional[datetime]] = mapped_column(nullable=True)

    # relationships
    comments: Mapped[list["TaskComment"]] = relationship(back_populates="task")

    def __repr__(self) -> str:
        return f"<Task id={self.id!r} title={self.title!r}>"


# ──────────────────────────────────────────────────────────────────────────────
# TaskComment
# ──────────────────────────────────────────────────────────────────────────────


class TaskComment(UUIDMixin, TimestampMixin, Base):
    """Comment on a task."""

    __tablename__ = "task_comments"

    task_id: Mapped[uuid.UUID] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("tasks.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    author_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("profiles.id", ondelete="SET NULL"),
        nullable=True,
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)

    # relationships
    task: Mapped["Task"] = relationship(back_populates="comments")

    def __repr__(self) -> str:
        return f"<TaskComment id={self.id!r}>"


# ──────────────────────────────────────────────────────────────────────────────
# WorkflowDefinition
# ──────────────────────────────────────────────────────────────────────────────


class WorkflowDefinition(UUIDMixin, TimestampMixin, Base):
    """Definition of a multi-step workflow."""

    __tablename__ = "workflow_definitions"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    trigger_event: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, server_default=text("true"), nullable=False)

    # relationships
    steps: Mapped[list["WorkflowStep"]] = relationship(back_populates="workflow")
    executions: Mapped[list["WorkflowExecution"]] = relationship(back_populates="workflow")

    def __repr__(self) -> str:
        return f"<WorkflowDefinition id={self.id!r} name={self.name!r}>"


# ──────────────────────────────────────────────────────────────────────────────
# WorkflowStep
# ──────────────────────────────────────────────────────────────────────────────


class WorkflowStep(UUIDMixin, TimestampMixin, Base):
    """Individual step within a workflow definition."""

    __tablename__ = "workflow_steps"

    workflow_id: Mapped[uuid.UUID] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("workflow_definitions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    step_number: Mapped[int] = mapped_column(Integer, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    action_type: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    required_role: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    is_optional: Mapped[bool] = mapped_column(Boolean, server_default=text("false"), nullable=False)

    # relationships
    workflow: Mapped["WorkflowDefinition"] = relationship(back_populates="steps")

    def __repr__(self) -> str:
        return f"<WorkflowStep id={self.id!r} step={self.step_number}>"


# ──────────────────────────────────────────────────────────────────────────────
# WorkflowExecution
# ──────────────────────────────────────────────────────────────────────────────


class WorkflowExecution(UUIDMixin, TimestampMixin, Base):
    """Instance of a workflow being executed."""

    __tablename__ = "workflow_executions"

    workflow_id: Mapped[uuid.UUID] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("workflow_definitions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    triggered_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("profiles.id", ondelete="SET NULL"),
        nullable=True,
    )
    current_step: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    status: Mapped[str] = mapped_column(
        String(50), server_default=text("'running'"), nullable=False
    )
    started_at: Mapped[Optional[datetime]] = mapped_column(nullable=True)
    completed_at: Mapped[Optional[datetime]] = mapped_column(nullable=True)
    context_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        pgUUID(as_uuid=True), nullable=True
    )
    context_type: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    # relationships
    workflow: Mapped["WorkflowDefinition"] = relationship(back_populates="executions")
    history: Mapped[list["WorkflowHistory"]] = relationship(back_populates="execution")

    def __repr__(self) -> str:
        return f"<WorkflowExecution id={self.id!r} status={self.status!r}>"


# ──────────────────────────────────────────────────────────────────────────────
# WorkflowHistory
# ──────────────────────────────────────────────────────────────────────────────


class WorkflowHistory(UUIDMixin, TimestampMixin, Base):
    """Audit log entry for a workflow execution step."""

    __tablename__ = "workflow_history"

    execution_id: Mapped[uuid.UUID] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("workflow_executions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    step_number: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    action: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    performed_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("profiles.id", ondelete="SET NULL"),
        nullable=True,
    )
    result: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # relationships
    execution: Mapped["WorkflowExecution"] = relationship(back_populates="history")

    def __repr__(self) -> str:
        return f"<WorkflowHistory id={self.id!r} step={self.step_number}>"
