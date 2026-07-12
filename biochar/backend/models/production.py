"""
biochar/backend/models/production.py
──────────────────────────────────────────────────────────────────────────────
Production & Distribution domain models.

Tables: biochar_batches, biochar_batch_runs, storage_locations,
        biochar_inventory, inventory_movements, shipments,
        biochar_applications
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
# BiocharBatch
# ──────────────────────────────────────────────────────────────────────────────


class BiocharBatch(UUIDMixin, TimestampMixin, Base):
    """Root entity for a single biochar production batch."""

    __tablename__ = "biochar_batches"

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
        index=True,
    )
    batch_lot_number: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    status: Mapped[str] = mapped_column(
        String(50), server_default=text("'sourcing_purgatory'"), nullable=False
    )
    net_sequestration_tco2e: Mapped[float] = mapped_column(
        Float, server_default=text("0.0"), nullable=False
    )
    feedstock_batch_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("feedstock_batches.id", ondelete="SET NULL"),
        nullable=True,
    )
    pyrolysis_run_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("pyrolysis_runs.id", ondelete="SET NULL"),
        nullable=True,
    )
    total_mass_kg: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # relationships
    batch_runs: Mapped[list["BiocharBatchRun"]] = relationship(back_populates="biochar_batch")
    inventory_records: Mapped[list["BiocharInventory"]] = relationship(back_populates="biochar_batch")
    shipments: Mapped[list["Shipment"]] = relationship(back_populates="biochar_batch")
    applications: Mapped[list["BiocharApplication"]] = relationship(back_populates="biochar_batch")

    def __repr__(self) -> str:
        return f"<BiocharBatch id={self.id!r} lot={self.batch_lot_number!r} status={self.status!r}>"


# ──────────────────────────────────────────────────────────────────────────────
# BiocharBatchRun
# ──────────────────────────────────────────────────────────────────────────────


class BiocharBatchRun(UUIDMixin, TimestampMixin, Base):
    """Links a biochar batch to its pyrolysis run(s)."""

    __tablename__ = "biochar_batch_runs"

    biochar_batch_id: Mapped[uuid.UUID] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("biochar_batches.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    pyrolysis_run_id: Mapped[uuid.UUID] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("pyrolysis_runs.id", ondelete="CASCADE"),
        nullable=False,
    )
    output_mass_kg: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # relationships
    biochar_batch: Mapped["BiocharBatch"] = relationship(back_populates="batch_runs")

    def __repr__(self) -> str:
        return f"<BiocharBatchRun id={self.id!r}>"


# ──────────────────────────────────────────────────────────────────────────────
# StorageLocation
# ──────────────────────────────────────────────────────────────────────────────


class StorageLocation(UUIDMixin, TimestampMixin, Base):
    """Physical storage location for biochar inventory."""

    __tablename__ = "storage_locations"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    plant_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("plants.id", ondelete="SET NULL"),
        nullable=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    location_type: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    capacity_kg: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    latitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    longitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, server_default=text("true"), nullable=False)

    # relationships
    inventory_records: Mapped[list["BiocharInventory"]] = relationship(back_populates="storage_location")
    movements_from: Mapped[list["InventoryMovement"]] = relationship(
        back_populates="from_location",
        foreign_keys="InventoryMovement.from_location_id",
    )
    movements_to: Mapped[list["InventoryMovement"]] = relationship(
        back_populates="to_location",
        foreign_keys="InventoryMovement.to_location_id",
    )

    def __repr__(self) -> str:
        return f"<StorageLocation id={self.id!r} name={self.name!r}>"


# ──────────────────────────────────────────────────────────────────────────────
# BiocharInventory
# ──────────────────────────────────────────────────────────────────────────────


class BiocharInventory(UUIDMixin, TimestampMixin, Base):
    """Current inventory position for a biochar batch at a storage location."""

    __tablename__ = "biochar_inventory"

    biochar_batch_id: Mapped[uuid.UUID] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("biochar_batches.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    storage_location_id: Mapped[uuid.UUID] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("storage_locations.id", ondelete="CASCADE"),
        nullable=False,
    )
    quantity_kg: Mapped[float] = mapped_column(Float, server_default=text("0"), nullable=False)
    status: Mapped[str] = mapped_column(
        String(50), server_default=text("'available'"), nullable=False
    )

    # relationships
    biochar_batch: Mapped["BiocharBatch"] = relationship(back_populates="inventory_records")
    storage_location: Mapped["StorageLocation"] = relationship(back_populates="inventory_records")

    def __repr__(self) -> str:
        return f"<BiocharInventory id={self.id!r} qty={self.quantity_kg}kg>"


# ──────────────────────────────────────────────────────────────────────────────
# InventoryMovement
# ──────────────────────────────────────────────────────────────────────────────


class InventoryMovement(UUIDMixin, TimestampMixin, Base):
    """Tracks biochar inventory transfers between storage locations."""

    __tablename__ = "inventory_movements"

    biochar_batch_id: Mapped[uuid.UUID] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("biochar_batches.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    from_location_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("storage_locations.id", ondelete="SET NULL"),
        nullable=True,
    )
    to_location_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("storage_locations.id", ondelete="SET NULL"),
        nullable=True,
    )
    quantity_kg: Mapped[float] = mapped_column(Float, nullable=False)
    movement_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    moved_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("profiles.id", ondelete="SET NULL"),
        nullable=True,
    )
    movement_date: Mapped[Optional[datetime]] = mapped_column(nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # relationships
    from_location: Mapped[Optional["StorageLocation"]] = relationship(
        back_populates="movements_from",
        foreign_keys=[from_location_id],
    )
    to_location: Mapped[Optional["StorageLocation"]] = relationship(
        back_populates="movements_to",
        foreign_keys=[to_location_id],
    )

    def __repr__(self) -> str:
        return f"<InventoryMovement id={self.id!r} qty={self.quantity_kg}kg>"


# ──────────────────────────────────────────────────────────────────────────────
# Shipment
# ──────────────────────────────────────────────────────────────────────────────


class Shipment(UUIDMixin, TimestampMixin, Base):
    """Outbound shipment of biochar to customers or application sites."""

    __tablename__ = "shipments"

    biochar_batch_id: Mapped[uuid.UUID] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("biochar_batches.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    delivery_ticket_id: Mapped[Optional[str]] = mapped_column(String(128), nullable=True, unique=True)
    recipient_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    recipient_id: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    shipped_mass_kg: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    ship_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    delivery_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    destination_latitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    destination_longitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    status: Mapped[str] = mapped_column(
        String(50), server_default=text("'pending'"), nullable=False
    )
    tracking_number: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # relationships
    biochar_batch: Mapped["BiocharBatch"] = relationship(back_populates="shipments")

    def __repr__(self) -> str:
        return f"<Shipment id={self.id!r} status={self.status!r}>"


# ──────────────────────────────────────────────────────────────────────────────
# BiocharApplication
# ──────────────────────────────────────────────────────────────────────────────


class BiocharApplication(UUIDMixin, TimestampMixin, Base):
    """
    Records where biochar was applied (the carbon sink).
    Captures GPS, photo evidence, and farmer attestation.
    """

    __tablename__ = "biochar_applications"

    biochar_batch_id: Mapped[uuid.UUID] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("biochar_batches.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    applied_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("profiles.id", ondelete="SET NULL"),
        nullable=True,
    )
    farmer_id: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    application_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    mass_applied_kg: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    area_hectares: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    latitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    longitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    photo_evidence_url: Mapped[Optional[str]] = mapped_column(String(1024), nullable=True)
    attestation_timestamp: Mapped[Optional[datetime]] = mapped_column(nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # relationships
    biochar_batch: Mapped["BiocharBatch"] = relationship(back_populates="applications")

    def __repr__(self) -> str:
        return f"<BiocharApplication id={self.id!r}>"
