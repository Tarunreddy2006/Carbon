"""
biochar/backend/models/plant.py
──────────────────────────────────────────────────────────────────────────────
Plant & Reactor domain models.

Tables: plants, reactors, plant_operators, pyrolysis_runs,
        reactor_sensor_logs, fuel_consumption, electricity_consumption,
        reactor_maintenance
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
# Plant
# ──────────────────────────────────────────────────────────────────────────────


class Plant(UUIDMixin, TimestampMixin, Base):
    """Pyrolysis production facility."""

    __tablename__ = "plants"

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
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    location: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    latitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    longitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    capacity_tons_per_day: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    commissioning_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, server_default=text("true"), nullable=False)

    # relationships
    reactors: Mapped[list["Reactor"]] = relationship(back_populates="plant")
    operators: Mapped[list["PlantOperator"]] = relationship(back_populates="plant")

    def __repr__(self) -> str:
        return f"<Plant id={self.id!r} name={self.name!r}>"


# ──────────────────────────────────────────────────────────────────────────────
# Reactor
# ──────────────────────────────────────────────────────────────────────────────


class Reactor(UUIDMixin, TimestampMixin, Base):
    """Individual pyrolysis reactor / kiln within a plant."""

    __tablename__ = "reactors"

    plant_id: Mapped[uuid.UUID] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("plants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    model: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    manufacturer: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    max_temp_celsius: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    capacity_kg_per_hour: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    status: Mapped[str] = mapped_column(
        String(50), server_default=text("'operational'"), nullable=False
    )

    # relationships
    plant: Mapped["Plant"] = relationship(back_populates="reactors")
    pyrolysis_runs: Mapped[list["PyrolysisRun"]] = relationship(back_populates="reactor")
    sensor_logs: Mapped[list["ReactorSensorLog"]] = relationship(back_populates="reactor")
    maintenance_records: Mapped[list["ReactorMaintenance"]] = relationship(back_populates="reactor")

    def __repr__(self) -> str:
        return f"<Reactor id={self.id!r} name={self.name!r}>"


# ──────────────────────────────────────────────────────────────────────────────
# PlantOperator
# ──────────────────────────────────────────────────────────────────────────────


class PlantOperator(UUIDMixin, TimestampMixin, Base):
    """Operator assignment for a plant."""

    __tablename__ = "plant_operators"

    plant_id: Mapped[uuid.UUID] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("plants.id", ondelete="CASCADE"),
        nullable=False,
    )
    profile_id: Mapped[uuid.UUID] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("profiles.id", ondelete="CASCADE"),
        nullable=False,
    )
    role: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    certification: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, server_default=text("true"), nullable=False)

    # relationships
    plant: Mapped["Plant"] = relationship(back_populates="operators")

    def __repr__(self) -> str:
        return f"<PlantOperator id={self.id!r}>"


# ──────────────────────────────────────────────────────────────────────────────
# PyrolysisRun
# ──────────────────────────────────────────────────────────────────────────────


class PyrolysisRun(UUIDMixin, TimestampMixin, Base):
    """A single pyrolysis production run on a reactor."""

    __tablename__ = "pyrolysis_runs"

    reactor_id: Mapped[uuid.UUID] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("reactors.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    feedstock_batch_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("feedstock_batches.id", ondelete="SET NULL"),
        nullable=True,
    )
    operator_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("profiles.id", ondelete="SET NULL"),
        nullable=True,
    )
    run_number: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    start_time: Mapped[Optional[datetime]] = mapped_column(nullable=True)
    end_time: Mapped[Optional[datetime]] = mapped_column(nullable=True)
    peak_temp_celsius: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    avg_temp_celsius: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    input_mass_kg: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    output_mass_kg: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    yield_pct: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    status: Mapped[str] = mapped_column(
        String(50), server_default=text("'in_progress'"), nullable=False
    )
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # relationships
    reactor: Mapped["Reactor"] = relationship(back_populates="pyrolysis_runs")
    sensor_logs: Mapped[list["ReactorSensorLog"]] = relationship(back_populates="pyrolysis_run")
    fuel_records: Mapped[list["FuelConsumption"]] = relationship(back_populates="pyrolysis_run")
    electricity_records: Mapped[list["ElectricityConsumption"]] = relationship(back_populates="pyrolysis_run")

    def __repr__(self) -> str:
        return f"<PyrolysisRun id={self.id!r} status={self.status!r}>"


# ──────────────────────────────────────────────────────────────────────────────
# ReactorSensorLog
# ──────────────────────────────────────────────────────────────────────────────


class ReactorSensorLog(UUIDMixin, Base):
    """High-frequency sensor / SCADA telemetry row from a reactor."""

    __tablename__ = "reactor_sensor_logs"

    reactor_id: Mapped[uuid.UUID] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("reactors.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    pyrolysis_run_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("pyrolysis_runs.id", ondelete="SET NULL"),
        nullable=True,
    )
    timestamp: Mapped[datetime] = mapped_column(nullable=False, index=True)
    temperature_celsius: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    pressure_kpa: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    oxygen_pct: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    gas_flow_rate: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    sensor_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    # relationships
    reactor: Mapped["Reactor"] = relationship(back_populates="sensor_logs")
    pyrolysis_run: Mapped[Optional["PyrolysisRun"]] = relationship(back_populates="sensor_logs")

    def __repr__(self) -> str:
        return f"<ReactorSensorLog id={self.id!r} temp={self.temperature_celsius}>"


# ──────────────────────────────────────────────────────────────────────────────
# FuelConsumption
# ──────────────────────────────────────────────────────────────────────────────


class FuelConsumption(UUIDMixin, TimestampMixin, Base):
    """Fossil fuel consumption record for a pyrolysis run."""

    __tablename__ = "fuel_consumption"

    pyrolysis_run_id: Mapped[uuid.UUID] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("pyrolysis_runs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    fuel_type: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    quantity_liters: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    cost: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    currency: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    date_recorded: Mapped[Optional[date]] = mapped_column(Date, nullable=True)

    # relationships
    pyrolysis_run: Mapped["PyrolysisRun"] = relationship(back_populates="fuel_records")

    def __repr__(self) -> str:
        return f"<FuelConsumption id={self.id!r}>"


# ──────────────────────────────────────────────────────────────────────────────
# ElectricityConsumption
# ──────────────────────────────────────────────────────────────────────────────


class ElectricityConsumption(UUIDMixin, TimestampMixin, Base):
    """Electricity consumption record for a pyrolysis run."""

    __tablename__ = "electricity_consumption"

    pyrolysis_run_id: Mapped[uuid.UUID] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("pyrolysis_runs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    source: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    kwh: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    cost: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    currency: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    date_recorded: Mapped[Optional[date]] = mapped_column(Date, nullable=True)

    # relationships
    pyrolysis_run: Mapped["PyrolysisRun"] = relationship(back_populates="electricity_records")

    def __repr__(self) -> str:
        return f"<ElectricityConsumption id={self.id!r}>"


# ──────────────────────────────────────────────────────────────────────────────
# ReactorMaintenance
# ──────────────────────────────────────────────────────────────────────────────


class ReactorMaintenance(UUIDMixin, TimestampMixin, Base):
    """Maintenance event for a reactor."""

    __tablename__ = "reactor_maintenance"

    reactor_id: Mapped[uuid.UUID] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("reactors.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    performed_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("profiles.id", ondelete="SET NULL"),
        nullable=True,
    )
    maintenance_type: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    scheduled_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    completed_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(
        String(50), server_default=text("'scheduled'"), nullable=False
    )
    cost: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # relationships
    reactor: Mapped["Reactor"] = relationship(back_populates="maintenance_records")

    def __repr__(self) -> str:
        return f"<ReactorMaintenance id={self.id!r} type={self.maintenance_type!r}>"
