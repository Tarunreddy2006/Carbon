"""
biochar/backend/models/organization.py
──────────────────────────────────────────────────────────────────────────────
Authentication & Organization domain models.

Tables: organizations, profiles, roles, organization_members, invitations
──────────────────────────────────────────────────────────────────────────────
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Boolean, ForeignKey, String, Text, text
from sqlalchemy.dialects.postgresql import UUID as pgUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from biochar.backend.models.base import Base, TimestampMixin, UUIDMixin

if TYPE_CHECKING:
    from biochar.backend.models.project import Project


# ──────────────────────────────────────────────────────────────────────────────
# Organization
# ──────────────────────────────────────────────────────────────────────────────


class Organization(UUIDMixin, TimestampMixin, Base):
    """Multi-tenant organisation root entity."""

    __tablename__ = "organizations"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    logo_url: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    website: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, server_default=text("true"), nullable=False)

    # relationships
    members: Mapped[list["OrganizationMember"]] = relationship(back_populates="organization")
    roles: Mapped[list["Role"]] = relationship(back_populates="organization")
    invitations: Mapped[list["Invitation"]] = relationship(back_populates="organization")
    projects: Mapped[list["Project"]] = relationship(back_populates="organization")

    def __repr__(self) -> str:
        return f"<Organization id={self.id!r} slug={self.slug!r}>"


# ──────────────────────────────────────────────────────────────────────────────
# Profile
# ──────────────────────────────────────────────────────────────────────────────


class Profile(UUIDMixin, TimestampMixin, Base):
    """
    User profile linked to Supabase Auth (auth.users).
    The ``id`` mirrors ``auth.users.id``.
    """

    __tablename__ = "profiles"

    email: Mapped[str] = mapped_column(String(320), nullable=False, unique=True)
    full_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    avatar_url: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    phone: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, server_default=text("true"), nullable=False)

    # relationships
    memberships: Mapped[list["OrganizationMember"]] = relationship(back_populates="profile")

    def __repr__(self) -> str:
        return f"<Profile id={self.id!r} email={self.email!r}>"


# ──────────────────────────────────────────────────────────────────────────────
# Role
# ──────────────────────────────────────────────────────────────────────────────


class Role(UUIDMixin, TimestampMixin, Base):
    """Organisation-scoped role definition for RBAC."""

    __tablename__ = "roles"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    permissions: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_system: Mapped[bool] = mapped_column(Boolean, server_default=text("false"), nullable=False)

    # relationships
    organization: Mapped["Organization"] = relationship(back_populates="roles")
    members: Mapped[list["OrganizationMember"]] = relationship(back_populates="role")

    def __repr__(self) -> str:
        return f"<Role id={self.id!r} name={self.name!r}>"


# ──────────────────────────────────────────────────────────────────────────────
# OrganizationMember
# ──────────────────────────────────────────────────────────────────────────────


class OrganizationMember(UUIDMixin, TimestampMixin, Base):
    """Join table linking profiles to organisations with a role."""

    __tablename__ = "organization_members"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
    )
    profile_id: Mapped[uuid.UUID] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("profiles.id", ondelete="CASCADE"),
        nullable=False,
    )
    role_id: Mapped[uuid.UUID] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("roles.id", ondelete="SET NULL"),
        nullable=True,
    )
    is_active: Mapped[bool] = mapped_column(Boolean, server_default=text("true"), nullable=False)

    # relationships
    organization: Mapped["Organization"] = relationship(back_populates="members")
    profile: Mapped["Profile"] = relationship(back_populates="memberships")
    role: Mapped[Optional["Role"]] = relationship(back_populates="members")

    def __repr__(self) -> str:
        return f"<OrganizationMember id={self.id!r} org={self.organization_id!r}>"


# ──────────────────────────────────────────────────────────────────────────────
# Invitation
# ──────────────────────────────────────────────────────────────────────────────


class Invitation(UUIDMixin, TimestampMixin, Base):
    """Pending invitation to join an organisation."""

    __tablename__ = "invitations"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
    )
    email: Mapped[str] = mapped_column(String(320), nullable=False)
    role_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("roles.id", ondelete="SET NULL"),
        nullable=True,
    )
    invited_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("profiles.id", ondelete="SET NULL"),
        nullable=True,
    )
    status: Mapped[str] = mapped_column(
        String(20), server_default=text("'pending'"), nullable=False
    )
    expires_at: Mapped[Optional[datetime]] = mapped_column(nullable=True)

    # relationships
    organization: Mapped["Organization"] = relationship(back_populates="invitations")

    def __repr__(self) -> str:
        return f"<Invitation id={self.id!r} email={self.email!r} status={self.status!r}>"
