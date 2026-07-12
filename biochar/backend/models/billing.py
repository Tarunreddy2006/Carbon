"""
biochar/backend/models/billing.py
──────────────────────────────────────────────────────────────────────────────
Billing & Subscription domain models.

Tables: subscription_plans, organization_subscriptions, usage_metrics,
        invoices, payments, invoice_items, coupons
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
# SubscriptionPlan
# ──────────────────────────────────────────────────────────────────────────────


class SubscriptionPlan(UUIDMixin, TimestampMixin, Base):
    """Available subscription plan / tier."""

    __tablename__ = "subscription_plans"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    price_monthly_usd: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    price_annual_usd: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    max_projects: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    max_users: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    max_batches_per_month: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    features: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, server_default=text("true"), nullable=False)
    sort_order: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    # relationships
    subscriptions: Mapped[list["OrganizationSubscription"]] = relationship(
        back_populates="plan"
    )

    def __repr__(self) -> str:
        return f"<SubscriptionPlan id={self.id!r} name={self.name!r}>"


# ──────────────────────────────────────────────────────────────────────────────
# OrganizationSubscription
# ──────────────────────────────────────────────────────────────────────────────


class OrganizationSubscription(UUIDMixin, TimestampMixin, Base):
    """Active subscription of an organisation to a plan."""

    __tablename__ = "organization_subscriptions"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    plan_id: Mapped[uuid.UUID] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("subscription_plans.id", ondelete="CASCADE"),
        nullable=False,
    )
    status: Mapped[str] = mapped_column(
        String(50), server_default=text("'active'"), nullable=False
    )
    billing_cycle: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    start_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    end_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    trial_ends_at: Mapped[Optional[datetime]] = mapped_column(nullable=True)
    stripe_subscription_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    coupon_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("coupons.id", ondelete="SET NULL"),
        nullable=True,
    )

    # relationships
    plan: Mapped["SubscriptionPlan"] = relationship(back_populates="subscriptions")
    invoices: Mapped[list["Invoice"]] = relationship(back_populates="subscription")

    def __repr__(self) -> str:
        return f"<OrganizationSubscription id={self.id!r} status={self.status!r}>"


# ──────────────────────────────────────────────────────────────────────────────
# UsageMetric
# ──────────────────────────────────────────────────────────────────────────────


class UsageMetric(UUIDMixin, TimestampMixin, Base):
    """Usage tracking metric for billing purposes."""

    __tablename__ = "usage_metrics"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    metric_name: Mapped[str] = mapped_column(String(100), nullable=False)
    value: Mapped[float] = mapped_column(Float, server_default=text("0"), nullable=False)
    period_start: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    period_end: Mapped[Optional[date]] = mapped_column(Date, nullable=True)

    def __repr__(self) -> str:
        return f"<UsageMetric id={self.id!r} metric={self.metric_name!r}>"


# ──────────────────────────────────────────────────────────────────────────────
# Invoice
# ──────────────────────────────────────────────────────────────────────────────


class Invoice(UUIDMixin, TimestampMixin, Base):
    """Invoice for an organisation subscription."""

    __tablename__ = "invoices"

    subscription_id: Mapped[uuid.UUID] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("organization_subscriptions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    invoice_number: Mapped[Optional[str]] = mapped_column(String(128), nullable=True, unique=True)
    amount_usd: Mapped[float] = mapped_column(Float, server_default=text("0"), nullable=False)
    tax_usd: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    total_usd: Mapped[float] = mapped_column(Float, server_default=text("0"), nullable=False)
    status: Mapped[str] = mapped_column(
        String(50), server_default=text("'pending'"), nullable=False
    )
    issue_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    due_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    paid_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    stripe_invoice_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    # relationships
    subscription: Mapped["OrganizationSubscription"] = relationship(back_populates="invoices")
    items: Mapped[list["InvoiceItem"]] = relationship(back_populates="invoice")
    payments: Mapped[list["Payment"]] = relationship(back_populates="invoice")

    def __repr__(self) -> str:
        return f"<Invoice id={self.id!r} number={self.invoice_number!r}>"


# ──────────────────────────────────────────────────────────────────────────────
# Payment
# ──────────────────────────────────────────────────────────────────────────────


class Payment(UUIDMixin, TimestampMixin, Base):
    """Payment against an invoice."""

    __tablename__ = "payments"

    invoice_id: Mapped[uuid.UUID] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("invoices.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    amount_usd: Mapped[float] = mapped_column(Float, nullable=False)
    payment_method: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    payment_date: Mapped[Optional[datetime]] = mapped_column(nullable=True)
    stripe_payment_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    status: Mapped[str] = mapped_column(
        String(50), server_default=text("'completed'"), nullable=False
    )

    # relationships
    invoice: Mapped["Invoice"] = relationship(back_populates="payments")

    def __repr__(self) -> str:
        return f"<Payment id={self.id!r} amount={self.amount_usd}>"


# ──────────────────────────────────────────────────────────────────────────────
# InvoiceItem
# ──────────────────────────────────────────────────────────────────────────────


class InvoiceItem(UUIDMixin, TimestampMixin, Base):
    """Line item on an invoice."""

    __tablename__ = "invoice_items"

    invoice_id: Mapped[uuid.UUID] = mapped_column(
        pgUUID(as_uuid=True),
        ForeignKey("invoices.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    description: Mapped[str] = mapped_column(String(500), nullable=False)
    quantity: Mapped[float] = mapped_column(Float, server_default=text("1"), nullable=False)
    unit_price_usd: Mapped[float] = mapped_column(Float, nullable=False)
    total_usd: Mapped[float] = mapped_column(Float, nullable=False)

    # relationships
    invoice: Mapped["Invoice"] = relationship(back_populates="items")

    def __repr__(self) -> str:
        return f"<InvoiceItem id={self.id!r} desc={self.description!r}>"


# ──────────────────────────────────────────────────────────────────────────────
# Coupon
# ──────────────────────────────────────────────────────────────────────────────


class Coupon(UUIDMixin, TimestampMixin, Base):
    """Discount coupon for subscriptions."""

    __tablename__ = "coupons"

    code: Mapped[str] = mapped_column(String(50), nullable=False, unique=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    discount_pct: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    discount_amount_usd: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    max_uses: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    current_uses: Mapped[int] = mapped_column(Integer, server_default=text("0"), nullable=False)
    valid_from: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    valid_until: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, server_default=text("true"), nullable=False)

    def __repr__(self) -> str:
        return f"<Coupon id={self.id!r} code={self.code!r}>"
