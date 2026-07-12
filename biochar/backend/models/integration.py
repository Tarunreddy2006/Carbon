"""
biochar/backend/models/integration.py
──────────────────────────────────────────────────────────────────────────────
Integration & IoT domain models.

Tables: integrations, api_keys, webhooks, webhook_deliveries,
        iot_devices, iot_readings, gps_devices, gps_tracking,
        laboratory_integrations, integration_logs
──────────────────────────────────────────────────────────────────────────────
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, Float, ForeignKey, Integer, String, Text, text
from sqlalchemy.dialects.postgresql import UUID as pgUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from biochar.backend.models.base import Base, TimestampMixin, UUIDMixin


# ──────────────────────────────────────────────────────────────────────────────
# Integration
# ──────────────────────────────────────────────────────────────────────────────


class Integration(UUIDMixin, TimestampMixin, Base):
    """External integration / connector configuration."""

    __tablename__ = "integrations"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    integration_type: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    provider: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    config: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(
        String(50), server_default=text("'active'"), nullable=False
    )
    is_active: Mapped[bool] = mapped_column(Boolean, server_default=text("true"), nullable=False)

    # relationships
    api_keys: Mapped[list["APIKey"]] = relationship(back_populates="integration")
    webhooks: Mapped[list["Webhook"]] = relationship(back_populates="integration")
    logs: Mapped[list["IntegrationLog"]] = relationship(back_populates="integration")

    def __repr__(self) -> str:
        return f"<Integration id={self.id!r} name={self.name!r}>"


# ──────────────────────────────────────────────────────────────────────────────
# APIKey
# ──────────────────────────────────────────────────────────────────────────────


class APIKey(UUIDMixin, TimestampMixin, Base):
    """API key for an integration."""

    __tablename__ = "api_keys"

    integration_id: Mapped[uuid.UUID] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("integrations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    key_hash: Mapped[str] = mapped_column(String(128), nullable=False)
    key_prefix: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    scopes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    expires_at: Mapped[Optional[datetime]] = mapped_column(nullable=True)
    last_used_at: Mapped[Optional[datetime]] = mapped_column(nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, server_default=text("true"), nullable=False)

    # relationships
    integration: Mapped["Integration"] = relationship(back_populates="api_keys")

    def __repr__(self) -> str:
        return f"<APIKey id={self.id!r} name={self.name!r}>"


# ──────────────────────────────────────────────────────────────────────────────
# Webhook
# ──────────────────────────────────────────────────────────────────────────────


class Webhook(UUIDMixin, TimestampMixin, Base):
    """Webhook endpoint configuration."""

    __tablename__ = "webhooks"

    integration_id: Mapped[uuid.UUID] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("integrations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    url: Mapped[str] = mapped_column(String(1024), nullable=False)
    events: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    secret_hash: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, server_default=text("true"), nullable=False)

    # relationships
    integration: Mapped["Integration"] = relationship(back_populates="webhooks")
    deliveries: Mapped[list["WebhookDelivery"]] = relationship(back_populates="webhook")

    def __repr__(self) -> str:
        return f"<Webhook id={self.id!r} url={self.url!r}>"


# ──────────────────────────────────────────────────────────────────────────────
# WebhookDelivery
# ──────────────────────────────────────────────────────────────────────────────


class WebhookDelivery(UUIDMixin, TimestampMixin, Base):
    """Record of a webhook delivery attempt."""

    __tablename__ = "webhook_deliveries"

    webhook_id: Mapped[uuid.UUID] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("webhooks.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    event: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    payload: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    response_status: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    response_body: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    delivered_at: Mapped[Optional[datetime]] = mapped_column(nullable=True)
    success: Mapped[bool] = mapped_column(Boolean, server_default=text("false"), nullable=False)
    retry_count: Mapped[int] = mapped_column(Integer, server_default=text("0"), nullable=False)

    # relationships
    webhook: Mapped["Webhook"] = relationship(back_populates="deliveries")

    def __repr__(self) -> str:
        return f"<WebhookDelivery id={self.id!r} success={self.success}>"


# ──────────────────────────────────────────────────────────────────────────────
# IOTDevice
# ──────────────────────────────────────────────────────────────────────────────


class IOTDevice(UUIDMixin, TimestampMixin, Base):
    """IoT sensor or device entity."""

    __tablename__ = "iot_devices"

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
    reactor_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("reactors.id", ondelete="SET NULL"),
        nullable=True,
    )
    device_id: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    device_type: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    manufacturer: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    firmware_version: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    status: Mapped[str] = mapped_column(
        String(50), server_default=text("'active'"), nullable=False
    )
    last_seen: Mapped[Optional[datetime]] = mapped_column(nullable=True)

    # relationships
    readings: Mapped[list["IOTReading"]] = relationship(back_populates="device")

    def __repr__(self) -> str:
        return f"<IOTDevice id={self.id!r} device_id={self.device_id!r}>"


# ──────────────────────────────────────────────────────────────────────────────
# IOTReading
# ──────────────────────────────────────────────────────────────────────────────


class IOTReading(UUIDMixin, Base):
    """Time-series reading from an IoT device."""

    __tablename__ = "iot_readings"

    device_id: Mapped[uuid.UUID] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("iot_devices.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    timestamp: Mapped[datetime] = mapped_column(nullable=False, index=True)
    metric_name: Mapped[str] = mapped_column(String(100), nullable=False)
    value: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    unit: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    quality: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)

    # relationships
    device: Mapped["IOTDevice"] = relationship(back_populates="readings")

    def __repr__(self) -> str:
        return f"<IOTReading id={self.id!r} metric={self.metric_name!r}>"


# ──────────────────────────────────────────────────────────────────────────────
# GPSDevice
# ──────────────────────────────────────────────────────────────────────────────


class GPSDevice(UUIDMixin, TimestampMixin, Base):
    """GPS tracking device entity."""

    __tablename__ = "gps_devices"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    device_id: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    device_type: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    assigned_to: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, server_default=text("true"), nullable=False)

    # relationships
    tracking_records: Mapped[list["GPSTracking"]] = relationship(back_populates="gps_device")

    def __repr__(self) -> str:
        return f"<GPSDevice id={self.id!r} device_id={self.device_id!r}>"


# ──────────────────────────────────────────────────────────────────────────────
# GPSTracking
# ──────────────────────────────────────────────────────────────────────────────


class GPSTracking(UUIDMixin, Base):
    """GPS tracking position record."""

    __tablename__ = "gps_tracking"

    gps_device_id: Mapped[uuid.UUID] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("gps_devices.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    timestamp: Mapped[datetime] = mapped_column(nullable=False, index=True)
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    altitude_m: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    speed_kmh: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    heading: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # relationships
    gps_device: Mapped["GPSDevice"] = relationship(back_populates="tracking_records")

    def __repr__(self) -> str:
        return f"<GPSTracking id={self.id!r} lat={self.latitude}>"


# ──────────────────────────────────────────────────────────────────────────────
# LaboratoryIntegration
# ──────────────────────────────────────────────────────────────────────────────


class LaboratoryIntegration(UUIDMixin, TimestampMixin, Base):
    """Configuration for integrating with external laboratory systems."""

    __tablename__ = "laboratory_integrations"

    laboratory_id: Mapped[uuid.UUID] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("laboratories.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    integration_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("integrations.id", ondelete="SET NULL"),
        nullable=True,
    )
    api_endpoint: Mapped[Optional[str]] = mapped_column(String(1024), nullable=True)
    auth_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, server_default=text("true"), nullable=False)

    def __repr__(self) -> str:
        return f"<LaboratoryIntegration id={self.id!r}>"


# ──────────────────────────────────────────────────────────────────────────────
# IntegrationLog
# ──────────────────────────────────────────────────────────────────────────────


class IntegrationLog(UUIDMixin, TimestampMixin, Base):
    """Audit log for integration events."""

    __tablename__ = "integration_logs"

    integration_id: Mapped[uuid.UUID] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("integrations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    event: Mapped[str] = mapped_column(String(100), nullable=False)
    direction: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    status: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    payload_size_bytes: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    duration_ms: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    # relationships
    integration: Mapped["Integration"] = relationship(back_populates="logs")

    def __repr__(self) -> str:
        return f"<IntegrationLog id={self.id!r} event={self.event!r}>"
