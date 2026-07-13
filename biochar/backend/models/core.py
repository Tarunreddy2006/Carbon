"""
biochar/backend/models/core.py
──────────────────────────────────────────────────────────────────────────────
Core domain database models aligned strictly with editor.sql and Supabase.
──────────────────────────────────────────────────────────────────────────────
"""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Optional

from sqlalchemy import Boolean, Date, Float, ForeignKey, Integer, String, Text, text, BigInteger
from sqlalchemy.dialects.postgresql import UUID as pgUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from biochar.backend.models.base import Base, TimestampMixin, UUIDMixin


# ──────────────────────────────────────────────────────────────────────────────
# Organization & Profile Models
# ──────────────────────────────────────────────────────────────────────────────

class Organization(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "organizations"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    legal_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    registration_number: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    gst_number: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    email: Mapped[Optional[str]] = mapped_column(String(320), nullable=True)
    phone: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    website: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    address: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    city: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    state: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    country: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    logo_url: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    subscription_plan: Mapped[str] = mapped_column(String(50), server_default=text("'Free'"), nullable=False)
    subscription_status: Mapped[str] = mapped_column(String(50), server_default=text("'Active'"), nullable=False)

    profiles: Mapped[list["Profile"]] = relationship(back_populates="organization")
    projects: Mapped[list["Project"]] = relationship(back_populates="organization")


class Profile(TimestampMixin, Base):
    __tablename__ = "profiles"

    id: Mapped[uuid.UUID] = mapped_column(pgUUID(as_uuid=True), primary_key=True)
    first_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    last_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    phone: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    avatar_url: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    organization_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        pgUUID(as_uuid=True), ForeignKey("organizations.id", ondelete="SET NULL"), nullable=True
    )

    organization: Mapped[Optional["Organization"]] = relationship(back_populates="profiles")


class Role(Base):
    __tablename__ = "roles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)


class OrganizationMember(Base):
    __tablename__ = "organization_members"

    id: Mapped[uuid.UUID] = mapped_column(
        pgUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    organization_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        pgUUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=True
    )
    user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        pgUUID(as_uuid=True), ForeignKey("profiles.id", ondelete="CASCADE"), nullable=True
    )
    role_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("roles.id", ondelete="SET NULL"), nullable=True
    )
    invited_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        pgUUID(as_uuid=True), ForeignKey("profiles.id", ondelete="SET NULL"), nullable=True
    )
    joined_at: Mapped[datetime] = mapped_column(server_default=text("now()"), nullable=False)


class Invitation(Base):
    __tablename__ = "invitations"

    id: Mapped[uuid.UUID] = mapped_column(
        pgUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    organization_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        pgUUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=True
    )
    email: Mapped[Optional[str]] = mapped_column(String(320), nullable=True)
    role_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("roles.id", ondelete="SET NULL"), nullable=True
    )
    invited_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        pgUUID(as_uuid=True), ForeignKey("profiles.id", ondelete="SET NULL"), nullable=True
    )
    token: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    expires_at: Mapped[Optional[datetime]] = mapped_column(nullable=True)
    accepted: Mapped[bool] = mapped_column(Boolean, server_default=text("false"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(server_default=text("now()"), nullable=False)


# ──────────────────────────────────────────────────────────────────────────────
# Projects & Feedstock
# ──────────────────────────────────────────────────────────────────────────────

class Project(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "projects"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        pgUUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    methodology: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    project_type: Mapped[str] = mapped_column(String(50), server_default=text("'Biochar'"), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    country: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    state: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    district: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    latitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    longitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    start_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    end_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(String(50), server_default=text("'Draft'"), nullable=False)
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        pgUUID(as_uuid=True), ForeignKey("profiles.id", ondelete="SET NULL"), nullable=True
    )

    organization: Mapped["Organization"] = relationship(back_populates="projects")
    feedstock_batches: Mapped[list["FeedstockBatch"]] = relationship(back_populates="project")


class FeedstockBatch(Base):
    __tablename__ = "feedstock_batches"

    id: Mapped[uuid.UUID] = mapped_column(
        pgUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        pgUUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    batch_code: Mapped[str] = mapped_column(String(128), nullable=False, unique=True)
    feedstock_type: Mapped[str] = mapped_column(String(100), nullable=False)
    supplier_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    supplier_contact: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    origin_location: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    received_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    weight_kg: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    moisture_percent: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    transport_distance_km: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    remarks: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        pgUUID(as_uuid=True), ForeignKey("profiles.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(server_default=text("now()"), nullable=False)

    project: Mapped["Project"] = relationship(back_populates="feedstock_batches")
    pyrolysis_runs: Mapped[list["PyrolysisRun"]] = relationship(back_populates="feedstock_batch")


# ──────────────────────────────────────────────────────────────────────────────
# Pyrolysis & Production
# ──────────────────────────────────────────────────────────────────────────────

class PyrolysisRun(Base):
    __tablename__ = "pyrolysis_runs"

    id: Mapped[uuid.UUID] = mapped_column(
        pgUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    feedstock_batch_id: Mapped[uuid.UUID] = mapped_column(
        pgUUID(as_uuid=True), ForeignKey("feedstock_batches.id", ondelete="CASCADE"), nullable=False
    )
    run_number: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    reactor_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    operator_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    start_time: Mapped[Optional[datetime]] = mapped_column(nullable=True)
    end_time: Mapped[Optional[datetime]] = mapped_column(nullable=True)
    average_temperature: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    maximum_temperature: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    residence_time_minutes: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    electricity_kwh: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    fuel_used_liters: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    remarks: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(server_default=text("now()"), nullable=False)

    feedstock_batch: Mapped["FeedstockBatch"] = relationship(back_populates="pyrolysis_runs")
    biochar_batches: Mapped[list["BiocharBatch"]] = relationship(back_populates="pyrolysis_run")
    sensor_logs: Mapped[list["ReactorSensorLog"]] = relationship(back_populates="pyrolysis_run")


class BiocharBatch(Base):
    __tablename__ = "biochar_batches"

    id: Mapped[uuid.UUID] = mapped_column(
        pgUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    pyrolysis_run_id: Mapped[uuid.UUID] = mapped_column(
        pgUUID(as_uuid=True), ForeignKey("pyrolysis_runs.id", ondelete="CASCADE"), nullable=False
    )
    batch_code: Mapped[str] = mapped_column(String(128), nullable=False, unique=True)
    weight_kg: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    storage_location: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    status: Mapped[str] = mapped_column(String(50), server_default=text("'In Storage'"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(server_default=text("now()"), nullable=False)

    pyrolysis_run: Mapped["PyrolysisRun"] = relationship(back_populates="biochar_batches")
    applications: Mapped[list["BiocharApplication"]] = relationship(back_populates="biochar_batch")
    shipments: Mapped[list["Shipment"]] = relationship(back_populates="biochar_batch")
    samples: Mapped[list["BiocharSample"]] = relationship(back_populates="biochar_batch")


class ReactorSensorLog(Base):
    __tablename__ = "reactor_sensor_logs"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    reactor_id: Mapped[Optional[uuid.UUID]] = mapped_column(pgUUID(as_uuid=True), nullable=True)
    pyrolysis_run_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        pgUUID(as_uuid=True), ForeignKey("pyrolysis_runs.id", ondelete="SET NULL"), nullable=True
    )
    sensor_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    sensor_value: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    unit: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    recorded_at: Mapped[datetime] = mapped_column(server_default=text("now()"), nullable=False)

    pyrolysis_run: Mapped[Optional["PyrolysisRun"]] = relationship(back_populates="sensor_logs")


# ──────────────────────────────────────────────────────────────────────────────
# Laboratory & Quality Check Systems
# ──────────────────────────────────────────────────────────────────────────────

class BiocharSample(Base):
    __tablename__ = "biochar_samples"

    id: Mapped[uuid.UUID] = mapped_column(
        pgUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    biochar_batch_id: Mapped[uuid.UUID] = mapped_column(
        pgUUID(as_uuid=True), ForeignKey("biochar_batches.id", ondelete="CASCADE"), nullable=False
    )
    sample_code: Mapped[str] = mapped_column(String(128), unique=True, nullable=False)
    collection_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    sampling_method: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    remarks: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    biochar_batch: Mapped["BiocharBatch"] = relationship(back_populates="samples")
    tests: Mapped[list["LaboratoryTest"]] = relationship(back_populates="sample")


class LaboratoryTest(Base):
    __tablename__ = "laboratory_tests"

    id: Mapped[uuid.UUID] = mapped_column(
        pgUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    sample_id: Mapped[uuid.UUID] = mapped_column(
        pgUUID(as_uuid=True), ForeignKey("biochar_samples.id", ondelete="CASCADE"), nullable=False
    )
    laboratory_id: Mapped[Optional[uuid.UUID]] = mapped_column(pgUUID(as_uuid=True), nullable=True)
    test_reference: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    received_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    completed_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    analyst_name: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(50), server_default=text("'Pending'"), nullable=False)
    remarks: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    sample: Mapped["BiocharSample"] = relationship(back_populates="tests")
    certificates: Mapped[list["LaboratoryCertificate"]] = relationship(back_populates="laboratory_test")
    results: Mapped[list["LaboratoryResult"]] = relationship(back_populates="laboratory_test")


class LaboratoryParameter(Base):
    __tablename__ = "laboratory_parameters"

    id: Mapped[uuid.UUID] = mapped_column(pgUUID(as_uuid=True), primary_key=True)
    parameter_name: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    unit: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    min_limit: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    max_limit: Mapped[Optional[float]] = mapped_column(Float, nullable=True)


class LaboratoryResult(Base):
    __tablename__ = "laboratory_results"

    id: Mapped[uuid.UUID] = mapped_column(
        pgUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    laboratory_test_id: Mapped[uuid.UUID] = mapped_column(
        pgUUID(as_uuid=True), ForeignKey("laboratory_tests.id", ondelete="CASCADE"), nullable=False
    )
    parameter_id: Mapped[uuid.UUID] = mapped_column(
        pgUUID(as_uuid=True), ForeignKey("laboratory_parameters.id", ondelete="CASCADE"), nullable=False
    )
    measured_value: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    pass_: Mapped[bool] = mapped_column("pass", Boolean, server_default=text("true"), nullable=False)
    remarks: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    laboratory_test: Mapped["LaboratoryTest"] = relationship(back_populates="results")
    parameter: Mapped["LaboratoryParameter"] = relationship()


class LaboratoryCertificate(Base):
    __tablename__ = "laboratory_certificates"

    id: Mapped[uuid.UUID] = mapped_column(
        pgUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    laboratory_test_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        pgUUID(as_uuid=True), ForeignKey("laboratory_tests.id", ondelete="CASCADE"), nullable=True
    )
    certificate_number: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    certificate_url: Mapped[Optional[str]] = mapped_column(String(1024), nullable=True)
    issue_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    expiry_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)

    laboratory_test: Mapped[Optional["LaboratoryTest"]] = relationship(back_populates="certificates")


# ──────────────────────────────────────────────────────────────────────────────
# Shipments & Applications
# ──────────────────────────────────────────────────────────────────────────────

class Shipment(Base):
    __tablename__ = "shipments"

    id: Mapped[uuid.UUID] = mapped_column(
        pgUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    biochar_batch_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        pgUUID(as_uuid=True), ForeignKey("biochar_batches.id", ondelete="CASCADE"), nullable=True
    )
    shipment_number: Mapped[Optional[str]] = mapped_column(String(128), unique=True, nullable=True)
    destination: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    transport_company: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    vehicle_number: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    shipped_weight_kg: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    shipped_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    status: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)

    biochar_batch: Mapped[Optional["BiocharBatch"]] = relationship(back_populates="shipments")


class BiocharApplication(Base):
    __tablename__ = "biochar_applications"

    id: Mapped[uuid.UUID] = mapped_column(
        pgUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    biochar_batch_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        pgUUID(as_uuid=True), ForeignKey("biochar_batches.id", ondelete="CASCADE"), nullable=True
    )
    application_site: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    latitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    longitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    application_rate_kg_ha: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    area_hectares: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    application_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    applied_by: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    remarks: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    biochar_batch: Mapped[Optional["BiocharBatch"]] = relationship(back_populates="applications")


# ──────────────────────────────────────────────────────────────────────────────
# Stub Classes for Unused tables (to avoid migration env/autogenerate errors)
# ──────────────────────────────────────────────────────────────────────────────

class FeedstockDelivery(Base):
    __tablename__ = "feedstock_deliveries"
    id: Mapped[uuid.UUID] = mapped_column(pgUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    batch_id: Mapped[uuid.UUID] = mapped_column(pgUUID(as_uuid=True), ForeignKey("feedstock_batches.id"))

class FeedstockQuality(Base):
    __tablename__ = "feedstock_quality"
    id: Mapped[uuid.UUID] = mapped_column(pgUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    batch_id: Mapped[uuid.UUID] = mapped_column(pgUUID(as_uuid=True), ForeignKey("feedstock_batches.id"))

class FeedstockSupplier(Base):
    __tablename__ = "feedstock_suppliers"
    id: Mapped[uuid.UUID] = mapped_column(pgUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    organization_id: Mapped[uuid.UUID] = mapped_column(pgUUID(as_uuid=True))

class FeedstockType(Base):
    __tablename__ = "feedstock_types"
    id: Mapped[uuid.UUID] = mapped_column(pgUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))

class Plant(Base):
    __tablename__ = "plants"
    id: Mapped[uuid.UUID] = mapped_column(pgUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    organization_id: Mapped[uuid.UUID] = mapped_column(pgUUID(as_uuid=True))
    project_id: Mapped[Optional[uuid.UUID]] = mapped_column(pgUUID(as_uuid=True))
    plant_name: Mapped[str] = mapped_column(String(255))

class Reactor(Base):
    __tablename__ = "reactors"
    id: Mapped[uuid.UUID] = mapped_column(pgUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    plant_id: Mapped[uuid.UUID] = mapped_column(pgUUID(as_uuid=True))

class PlantOperator(Base):
    __tablename__ = "plant_operators"
    id: Mapped[uuid.UUID] = mapped_column(pgUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    plant_id: Mapped[uuid.UUID] = mapped_column(pgUUID(as_uuid=True))

class FuelConsumption(Base):
    __tablename__ = "fuel_consumption"
    id: Mapped[uuid.UUID] = mapped_column(pgUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    pyrolysis_run_id: Mapped[uuid.UUID] = mapped_column(pgUUID(as_uuid=True))

class ElectricityConsumption(Base):
    __tablename__ = "electricity_consumption"
    id: Mapped[uuid.UUID] = mapped_column(pgUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    pyrolysis_run_id: Mapped[uuid.UUID] = mapped_column(pgUUID(as_uuid=True))

class ReactorMaintenance(Base):
    __tablename__ = "reactor_maintenance"
    id: Mapped[uuid.UUID] = mapped_column(pgUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    reactor_id: Mapped[uuid.UUID] = mapped_column(pgUUID(as_uuid=True))

class BiocharBatchRun(Base):
    __tablename__ = "biochar_batch_runs"
    id: Mapped[uuid.UUID] = mapped_column(pgUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    biochar_batch_id: Mapped[uuid.UUID] = mapped_column(pgUUID(as_uuid=True))
    pyrolysis_run_id: Mapped[uuid.UUID] = mapped_column(pgUUID(as_uuid=True))

class StorageLocation(Base):
    __tablename__ = "storage_locations"
    id: Mapped[uuid.UUID] = mapped_column(pgUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))

class BiocharInventory(Base):
    __tablename__ = "biochar_inventory"
    id: Mapped[uuid.UUID] = mapped_column(pgUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))

class InventoryMovement(Base):
    __tablename__ = "inventory_movements"
    id: Mapped[uuid.UUID] = mapped_column(pgUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))

class Laboratory(Base):
    __tablename__ = "laboratories"
    id: Mapped[uuid.UUID] = mapped_column(pgUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    organization_id: Mapped[uuid.UUID] = mapped_column(pgUUID(as_uuid=True))

class LaboratoryApproval(Base):
    __tablename__ = "laboratory_approvals"
    id: Mapped[uuid.UUID] = mapped_column(pgUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
