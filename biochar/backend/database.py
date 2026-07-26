"""
carbon/biochar/backend/database.py
──────────────────────────────────────────────────────────────────────────────
SQLAlchemy 2.x engine, session factory, and declarative base for the
Stomata biochar platform.

Configure via the ``DATABASE_URL`` environment variable (PostgreSQL).
──────────────────────────────────────────────────────────────────────────────
"""

from __future__ import annotations

import os

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker


DATABASE_URL: str = os.getenv("DATABASE_URL", "")

if not DATABASE_URL:
    raise RuntimeError(
        "DATABASE_URL environment variable is not set. "
        "The Stomata backend requires a PostgreSQL connection string."
    )

engine = create_engine(
    DATABASE_URL,
    echo=os.getenv("SQLALCHEMY_ECHO", "false").lower() == "true",
    pool_pre_ping=True,
    pool_size=int(os.getenv("SQLALCHEMY_POOL_SIZE", "5")),
    max_overflow=int(os.getenv("SQLALCHEMY_MAX_OVERFLOW", "10")),
)

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
)


class Base(DeclarativeBase):
    """SQLAlchemy 2.x declarative base for all Stomata models."""
    pass


def get_db():
    """FastAPI dependency – yields a scoped DB session, auto-closing on exit."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
