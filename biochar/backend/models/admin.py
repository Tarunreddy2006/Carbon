"""
biochar/backend/models/admin.py
──────────────────────────────────────────────────────────────────────────────
Platform Administration domain models.

Tables: system_settings, organization_settings, feature_flags,
        organization_features, audit_logs, login_history,
        api_rate_limits, announcements, support_tickets,
        support_ticket_replies
──────────────────────────────────────────────────────────────────────────────
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, ForeignKey, Integer, String, Text, text
from sqlalchemy.dialects.postgresql import UUID as pgUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from biochar.backend.models.base import Base, TimestampMixin, UUIDMixin


# ──────────────────────────────────────────────────────────────────────────────
# SystemSetting
# ──────────────────────────────────────────────────────────────────────────────


class SystemSetting(UUIDMixin, TimestampMixin, Base):
    """Global system-wide configuration setting."""

    __tablename__ = "system_settings"

    key: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    value: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_public: Mapped[bool] = mapped_column(Boolean, server_default=text("false"), nullable=False)

    def __repr__(self) -> str:
        return f"<SystemSetting id={self.id!r} key={self.key!r}>"


# ──────────────────────────────────────────────────────────────────────────────
# OrganizationSetting
# ──────────────────────────────────────────────────────────────────────────────


class OrganizationSetting(UUIDMixin, TimestampMixin, Base):
    """Organisation-scoped configuration setting."""

    __tablename__ = "organization_settings"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    key: Mapped[str] = mapped_column(String(255), nullable=False)
    value: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    def __repr__(self) -> str:
        return f"<OrganizationSetting id={self.id!r} key={self.key!r}>"


# ──────────────────────────────────────────────────────────────────────────────
# FeatureFlag
# ──────────────────────────────────────────────────────────────────────────────


class FeatureFlag(UUIDMixin, TimestampMixin, Base):
    """Platform feature flag definition."""

    __tablename__ = "feature_flags"

    key: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    default_enabled: Mapped[bool] = mapped_column(
        Boolean, server_default=text("false"), nullable=False
    )

    # relationships
    organization_features: Mapped[list["OrganizationFeature"]] = relationship(
        back_populates="feature_flag"
    )

    def __repr__(self) -> str:
        return f"<FeatureFlag id={self.id!r} key={self.key!r}>"


# ──────────────────────────────────────────────────────────────────────────────
# OrganizationFeature
# ──────────────────────────────────────────────────────────────────────────────


class OrganizationFeature(UUIDMixin, TimestampMixin, Base):
    """Organisation-specific override for a feature flag."""

    __tablename__ = "organization_features"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    feature_flag_id: Mapped[uuid.UUID] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("feature_flags.id", ondelete="CASCADE"),
        nullable=False,
    )
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False)

    # relationships
    feature_flag: Mapped["FeatureFlag"] = relationship(back_populates="organization_features")

    def __repr__(self) -> str:
        return f"<OrganizationFeature id={self.id!r} enabled={self.enabled}>"


# ──────────────────────────────────────────────────────────────────────────────
# AuditLog
# ──────────────────────────────────────────────────────────────────────────────


class AuditLog(UUIDMixin, Base):
    """Immutable platform audit trail record."""

    __tablename__ = "audit_logs"

    organization_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    profile_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("profiles.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    action: Mapped[str] = mapped_column(String(255), nullable=False)
    resource_type: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    resource_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    details: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    ip_address: Mapped[Optional[str]] = mapped_column(String(45), nullable=True)
    user_agent: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    timestamp: Mapped[datetime] = mapped_column(
        server_default=text("now()"),
        nullable=False,
        index=True,
    )

    def __repr__(self) -> str:
        return f"<AuditLog id={self.id!r} action={self.action!r}>"


# ──────────────────────────────────────────────────────────────────────────────
# LoginHistory
# ──────────────────────────────────────────────────────────────────────────────


class LoginHistory(UUIDMixin, Base):
    """User authentication event log."""

    __tablename__ = "login_history"

    profile_id: Mapped[uuid.UUID] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("profiles.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    login_at: Mapped[datetime] = mapped_column(
        server_default=text("now()"),
        nullable=False,
        index=True,
    )
    ip_address: Mapped[Optional[str]] = mapped_column(String(45), nullable=True)
    user_agent: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(
        String(50), server_default=text("'success'"), nullable=False
    )
    failure_reason: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    def __repr__(self) -> str:
        return f"<LoginHistory id={self.id!r} status={self.status!r}>"


# ──────────────────────────────────────────────────────────────────────────────
# APIRateLimit
# ──────────────────────────────────────────────────────────────────────────────


class APIRateLimit(UUIDMixin, TimestampMixin, Base):
    """Rate limit configuration and tracking per organisation or key."""

    __tablename__ = "api_rate_limits"

    organization_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    endpoint: Mapped[str] = mapped_column(String(255), nullable=False)
    limit_count: Mapped[int] = mapped_column(Integer, nullable=False)
    window_seconds: Mapped[int] = mapped_column(Integer, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, server_default=text("true"), nullable=False)

    def __repr__(self) -> str:
        return f"<APIRateLimit id={self.id!r} endpoint={self.endpoint!r}>"


# ──────────────────────────────────────────────────────────────────────────────
# Announcement
# ──────────────────────────────────────────────────────────────────────────────


class Announcement(UUIDMixin, TimestampMixin, Base):
    """Platform-wide or organisation broadcast announcement."""

    __tablename__ = "announcements"

    title: Mapped[str] = mapped_column(String(255), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    target_organization_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=True,
    )
    is_active: Mapped[bool] = mapped_column(Boolean, server_default=text("true"), nullable=False)
    published_at: Mapped[Optional[datetime]] = mapped_column(nullable=True)
    expires_at: Mapped[Optional[datetime]] = mapped_column(nullable=True)

    def __repr__(self) -> str:
        return f"<Announcement id={self.id!r} title={self.title!r}>"


# ──────────────────────────────────────────────────────────────────────────────
# SupportTicket
# ──────────────────────────────────────────────────────────────────────────────


class SupportTicket(UUIDMixin, TimestampMixin, Base):
    """Customer support ticket."""

    __tablename__ = "support_tickets"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    submitted_by: Mapped[uuid.UUID] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("profiles.id", ondelete="CASCADE"),
        nullable=False,
    )
    subject: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    priority: Mapped[str] = mapped_column(
        String(50), server_default=text("'medium'"), nullable=False
    )
    status: Mapped[str] = mapped_column(
        String(50), server_default=text("'open'"), nullable=False
    )
    assigned_to: Mapped[Optional[uuid.UUID]] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("profiles.id", ondelete="SET NULL"),
        nullable=True,
    )

    # relationships
    replies: Mapped[list["SupportTicketReply"]] = relationship(back_populates="ticket")

    def __repr__(self) -> str:
        return f"<SupportTicket id={self.id!r} subject={self.subject!r}>"


# ──────────────────────────────────────────────────────────────────────────────
# SupportTicketReply
# ──────────────────────────────────────────────────────────────────────────────


class SupportTicketReply(UUIDMixin, TimestampMixin, Base):
    """Reply message within a support ticket thread."""

    __tablename__ = "support_ticket_replies"

    ticket_id: Mapped[uuid.UUID] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("support_tickets.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    author_id: Mapped[uuid.UUID] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("profiles.id", ondelete="CASCADE"),
        nullable=False,
    )
    message: Mapped[str] = mapped_column(Text, nullable=False)
    is_internal: Mapped[bool] = mapped_column(Boolean, server_default=text("false"), nullable=False)

    # relationships
    ticket: Mapped["SupportTicket"] = relationship(back_populates="replies")

    def __repr__(self) -> str:
        return f"<SupportTicketReply id={self.id!r} ticket={self.ticket_id!r}>"
