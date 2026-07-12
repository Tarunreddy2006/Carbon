"""
biochar/backend/models/project.py
──────────────────────────────────────────────────────────────────────────────
Project Management domain models.

Tables: projects, project_sites, project_teams, project_documents
──────────────────────────────────────────────────────────────────────────────
"""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Boolean, Date, Float, ForeignKey, String, Text, text
from sqlalchemy.dialects.postgresql import UUID as pgUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from biochar.backend.models.base import Base, TimestampMixin, UUIDMixin

if TYPE_CHECKING:
    from biochar.backend.models.organization import Organization


# ──────────────────────────────────────────────────────────────────────────────
# Project
# ──────────────────────────────────────────────────────────────────────────────


class Project(UUIDMixin, TimestampMixin, Base):
    """Carbon-removal project scoped to an organisation."""

    __tablename__ = "projects"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(
        String(50), server_default=text("'draft'"), nullable=False
    )
    methodology: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    country: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    region: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    start_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    end_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, server_default=text("true"), nullable=False)

    # relationships
    organization: Mapped["Organization"] = relationship(back_populates="projects")
    sites: Mapped[list["ProjectSite"]] = relationship(back_populates="project")
    team_members: Mapped[list["ProjectTeam"]] = relationship(back_populates="project")
    documents: Mapped[list["ProjectDocument"]] = relationship(back_populates="project")

    def __repr__(self) -> str:
        return f"<Project id={self.id!r} name={self.name!r}>"


# ──────────────────────────────────────────────────────────────────────────────
# ProjectSite
# ──────────────────────────────────────────────────────────────────────────────


class ProjectSite(UUIDMixin, TimestampMixin, Base):
    """Physical location / site within a project."""

    __tablename__ = "project_sites"

    project_id: Mapped[uuid.UUID] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    address: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    latitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    longitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    area_hectares: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, server_default=text("true"), nullable=False)

    # relationships
    project: Mapped["Project"] = relationship(back_populates="sites")

    def __repr__(self) -> str:
        return f"<ProjectSite id={self.id!r} name={self.name!r}>"


# ──────────────────────────────────────────────────────────────────────────────
# ProjectTeam
# ──────────────────────────────────────────────────────────────────────────────


class ProjectTeam(UUIDMixin, TimestampMixin, Base):
    """Assigns a profile to a project with a specific role."""

    __tablename__ = "project_teams"

    project_id: Mapped[uuid.UUID] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
    )
    profile_id: Mapped[uuid.UUID] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("profiles.id", ondelete="CASCADE"),
        nullable=False,
    )
    role: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, server_default=text("true"), nullable=False)

    # relationships
    project: Mapped["Project"] = relationship(back_populates="team_members")

    def __repr__(self) -> str:
        return f"<ProjectTeam id={self.id!r} project={self.project_id!r}>"


# ──────────────────────────────────────────────────────────────────────────────
# ProjectDocument
# ──────────────────────────────────────────────────────────────────────────────


class ProjectDocument(UUIDMixin, TimestampMixin, Base):
    """Document / file attachment associated with a project."""

    __tablename__ = "project_documents"

    project_id: Mapped[uuid.UUID] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    file_url: Mapped[Optional[str]] = mapped_column(String(1024), nullable=True)
    file_type: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    file_size_bytes: Mapped[Optional[int]] = mapped_column(nullable=True)
    uploaded_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("profiles.id", ondelete="SET NULL"),
        nullable=True,
    )
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # relationships
    project: Mapped["Project"] = relationship(back_populates="documents")

    def __repr__(self) -> str:
        return f"<ProjectDocument id={self.id!r} name={self.name!r}>"
