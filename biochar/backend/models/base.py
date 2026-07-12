"""
biochar/backend/models/base.py
──────────────────────────────────────────────────────────────────────────────
Shared mixins and Base re-export for all CarbonOS ORM models.
──────────────────────────────────────────────────────────────────────────────
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import text
from sqlalchemy.dialects.postgresql import UUID as pgUUID
from sqlalchemy.orm import Mapped, mapped_column

from biochar.backend.database import Base


class UUIDMixin:
    """
    Provides a PostgreSQL-native UUID primary key column.
    Uses ``gen_random_uuid()`` as the server-side default.
    """

    id: Mapped[uuid.UUID] = mapped_column(
        pgUUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
        sort_order=-100,
    )


class TimestampMixin:
    """
    Provides ``created_at`` and ``updated_at`` timestamp columns
    with server-side defaults.
    """

    created_at: Mapped[datetime] = mapped_column(
        server_default=text("now()"),
        nullable=False,
        sort_order=900,
    )
    updated_at: Mapped[datetime] = mapped_column(
        server_default=text("now()"),
        onupdate=text("now()"),
        nullable=False,
        sort_order=901,
    )


__all__ = ["Base", "UUIDMixin", "TimestampMixin"]
