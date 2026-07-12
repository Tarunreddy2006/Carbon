"""
biochar/backend/models/carbon.py
──────────────────────────────────────────────────────────────────────────────
Carbon Calculation domain models.

Tables: calculation_methods, carbon_calculations, calculation_inputs,
        calculation_outputs, emission_sources, carbon_credit_estimates,
        calculation_versions
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
# CalculationMethod
# ──────────────────────────────────────────────────────────────────────────────


class CalculationMethod(UUIDMixin, TimestampMixin, Base):
    """Reference methodology used for carbon removal calculations."""

    __tablename__ = "calculation_methods"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    version: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    standard: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    formula: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, server_default=text("true"), nullable=False)

    # relationships
    calculations: Mapped[list["CarbonCalculation"]] = relationship(back_populates="method")

    def __repr__(self) -> str:
        return f"<CalculationMethod id={self.id!r} name={self.name!r}>"


# ──────────────────────────────────────────────────────────────────────────────
# CarbonCalculation
# ──────────────────────────────────────────────────────────────────────────────


class CarbonCalculation(UUIDMixin, TimestampMixin, Base):
    """A carbon removal / sequestration calculation for a batch or project."""

    __tablename__ = "carbon_calculations"

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
    biochar_batch_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("biochar_batches.id", ondelete="SET NULL"),
        nullable=True,
    )
    method_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("calculation_methods.id", ondelete="SET NULL"),
        nullable=True,
    )
    calculated_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("profiles.id", ondelete="SET NULL"),
        nullable=True,
    )
    calculation_date: Mapped[Optional[datetime]] = mapped_column(nullable=True)
    net_removal_tco2e: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    gross_removal_tco2e: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    total_emissions_tco2e: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    permanence_factor: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    status: Mapped[str] = mapped_column(
        String(50), server_default=text("'draft'"), nullable=False
    )
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # relationships
    method: Mapped[Optional["CalculationMethod"]] = relationship(back_populates="calculations")
    inputs: Mapped[list["CalculationInput"]] = relationship(back_populates="calculation")
    outputs: Mapped[list["CalculationOutput"]] = relationship(back_populates="calculation")
    credit_estimates: Mapped[list["CarbonCreditEstimate"]] = relationship(back_populates="calculation")
    versions: Mapped[list["CalculationVersion"]] = relationship(back_populates="calculation")

    def __repr__(self) -> str:
        return f"<CarbonCalculation id={self.id!r} net={self.net_removal_tco2e}>"


# ──────────────────────────────────────────────────────────────────────────────
# CalculationInput
# ──────────────────────────────────────────────────────────────────────────────


class CalculationInput(UUIDMixin, TimestampMixin, Base):
    """Input parameter for a carbon calculation."""

    __tablename__ = "calculation_inputs"

    calculation_id: Mapped[uuid.UUID] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("carbon_calculations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    parameter_name: Mapped[str] = mapped_column(String(255), nullable=False)
    value: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    unit: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    source: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # relationships
    calculation: Mapped["CarbonCalculation"] = relationship(back_populates="inputs")

    def __repr__(self) -> str:
        return f"<CalculationInput id={self.id!r} param={self.parameter_name!r}>"


# ──────────────────────────────────────────────────────────────────────────────
# CalculationOutput
# ──────────────────────────────────────────────────────────────────────────────


class CalculationOutput(UUIDMixin, TimestampMixin, Base):
    """Output / result of a carbon calculation."""

    __tablename__ = "calculation_outputs"

    calculation_id: Mapped[uuid.UUID] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("carbon_calculations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    parameter_name: Mapped[str] = mapped_column(String(255), nullable=False)
    value: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    unit: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # relationships
    calculation: Mapped["CarbonCalculation"] = relationship(back_populates="outputs")

    def __repr__(self) -> str:
        return f"<CalculationOutput id={self.id!r} param={self.parameter_name!r}>"


# ──────────────────────────────────────────────────────────────────────────────
# EmissionSource
# ──────────────────────────────────────────────────────────────────────────────


class EmissionSource(UUIDMixin, TimestampMixin, Base):
    """An emission source to be deducted from gross removal."""

    __tablename__ = "emission_sources"

    calculation_id: Mapped[uuid.UUID] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("carbon_calculations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    source_name: Mapped[str] = mapped_column(String(255), nullable=False)
    category: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    emission_tco2e: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    def __repr__(self) -> str:
        return f"<EmissionSource id={self.id!r} name={self.source_name!r}>"


# ──────────────────────────────────────────────────────────────────────────────
# CarbonCreditEstimate
# ──────────────────────────────────────────────────────────────────────────────


class CarbonCreditEstimate(UUIDMixin, TimestampMixin, Base):
    """Estimated carbon credits from a calculation."""

    __tablename__ = "carbon_credit_estimates"

    calculation_id: Mapped[uuid.UUID] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("carbon_calculations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    credits_tco2e: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    vintage_year: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    price_per_credit_usd: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    total_value_usd: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    status: Mapped[str] = mapped_column(
        String(50), server_default=text("'estimated'"), nullable=False
    )
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # relationships
    calculation: Mapped["CarbonCalculation"] = relationship(back_populates="credit_estimates")

    def __repr__(self) -> str:
        return f"<CarbonCreditEstimate id={self.id!r} credits={self.credits_tco2e}>"


# ──────────────────────────────────────────────────────────────────────────────
# CalculationVersion
# ──────────────────────────────────────────────────────────────────────────────


class CalculationVersion(UUIDMixin, TimestampMixin, Base):
    """Version history for a carbon calculation."""

    __tablename__ = "calculation_versions"

    calculation_id: Mapped[uuid.UUID] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("carbon_calculations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    version_number: Mapped[int] = mapped_column(Integer, nullable=False)
    net_removal_tco2e: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    change_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    changed_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("profiles.id", ondelete="SET NULL"),
        nullable=True,
    )

    # relationships
    calculation: Mapped["CarbonCalculation"] = relationship(back_populates="versions")

    def __repr__(self) -> str:
        return f"<CalculationVersion id={self.id!r} v={self.version_number}>"
