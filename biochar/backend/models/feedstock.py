"""
biochar/backend/models/feedstock.py
──────────────────────────────────────────────────────────────────────────────
Feedstock Management domain models.

Tables: feedstock_types, feedstock_suppliers, feedstock_batches,
        feedstock_deliveries, feedstock_quality
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
# FeedstockType
# ──────────────────────────────────────────────────────────────────────────────


class FeedstockType(UUIDMixin, TimestampMixin, Base):
    """Catalogue of supported biomass feedstock categories."""

    __tablename__ = "feedstock_types"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    category: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    moisture_content_pct: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    carbon_content_pct: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, server_default=text("true"), nullable=False)

    # relationships
    suppliers: Mapped[list["FeedstockSupplier"]] = relationship(back_populates="feedstock_type")
    batches: Mapped[list["FeedstockBatch"]] = relationship(back_populates="feedstock_type")

    def __repr__(self) -> str:
        return f"<FeedstockType id={self.id!r} name={self.name!r}>"


# ──────────────────────────────────────────────────────────────────────────────
# FeedstockSupplier
# ──────────────────────────────────────────────────────────────────────────────


class FeedstockSupplier(UUIDMixin, TimestampMixin, Base):
    """Biomass supplier / source entity."""

    __tablename__ = "feedstock_suppliers"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    feedstock_type_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("feedstock_types.id", ondelete="SET NULL"),
        nullable=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    contact_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    contact_email: Mapped[Optional[str]] = mapped_column(String(320), nullable=True)
    contact_phone: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    address: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    latitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    longitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    certification: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, server_default=text("true"), nullable=False)

    # relationships
    feedstock_type: Mapped[Optional["FeedstockType"]] = relationship(back_populates="suppliers")
    deliveries: Mapped[list["FeedstockDelivery"]] = relationship(back_populates="supplier")

    def __repr__(self) -> str:
        return f"<FeedstockSupplier id={self.id!r} name={self.name!r}>"


# ──────────────────────────────────────────────────────────────────────────────
# FeedstockBatch
# ──────────────────────────────────────────────────────────────────────────────


class FeedstockBatch(UUIDMixin, TimestampMixin, Base):
    """Inbound batch of raw biomass feedstock."""

    __tablename__ = "feedstock_batches"

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
    feedstock_type_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("feedstock_types.id", ondelete="SET NULL"),
        nullable=True,
    )
    batch_number: Mapped[str] = mapped_column(String(128), nullable=False)
    received_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    quantity_kg: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    moisture_pct: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    status: Mapped[str] = mapped_column(
        String(50), server_default=text("'received'"), nullable=False
    )
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # relationships
    feedstock_type: Mapped[Optional["FeedstockType"]] = relationship(back_populates="batches")
    deliveries: Mapped[list["FeedstockDelivery"]] = relationship(back_populates="feedstock_batch")
    quality_records: Mapped[list["FeedstockQuality"]] = relationship(back_populates="feedstock_batch")

    def __repr__(self) -> str:
        return f"<FeedstockBatch id={self.id!r} batch_number={self.batch_number!r}>"


# ──────────────────────────────────────────────────────────────────────────────
# FeedstockDelivery
# ──────────────────────────────────────────────────────────────────────────────


class FeedstockDelivery(UUIDMixin, TimestampMixin, Base):
    """Individual delivery event of feedstock from a supplier."""

    __tablename__ = "feedstock_deliveries"

    feedstock_batch_id: Mapped[uuid.UUID] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("feedstock_batches.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    supplier_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("feedstock_suppliers.id", ondelete="SET NULL"),
        nullable=True,
    )
    delivery_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    vehicle_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    gross_weight_kg: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    tare_weight_kg: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    net_weight_kg: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    source_latitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    source_longitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    satellite_clearance: Mapped[bool] = mapped_column(
        Boolean, server_default=text("false"), nullable=False
    )
    delivery_ticket: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # relationships
    feedstock_batch: Mapped["FeedstockBatch"] = relationship(back_populates="deliveries")
    supplier: Mapped[Optional["FeedstockSupplier"]] = relationship(back_populates="deliveries")

    def __repr__(self) -> str:
        return f"<FeedstockDelivery id={self.id!r}>"


# ──────────────────────────────────────────────────────────────────────────────
# FeedstockQuality
# ──────────────────────────────────────────────────────────────────────────────


class FeedstockQuality(UUIDMixin, TimestampMixin, Base):
    """Quality assessment record for a feedstock batch."""

    __tablename__ = "feedstock_quality"

    feedstock_batch_id: Mapped[uuid.UUID] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("feedstock_batches.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    test_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    tested_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("profiles.id", ondelete="SET NULL"),
        nullable=True,
    )
    moisture_pct: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    ash_content_pct: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    volatile_matter_pct: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    fixed_carbon_pct: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    calorific_value_mj: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    passed: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # relationships
    feedstock_batch: Mapped["FeedstockBatch"] = relationship(back_populates="quality_records")

    def __repr__(self) -> str:
        return f"<FeedstockQuality id={self.id!r} passed={self.passed!r}>"
