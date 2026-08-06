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


DATABASE_URL: str = os.getenv(
    "DATABASE_URL",
    os.getenv("BIOCHAR_DATABASE_URL", "sqlite:///biochar_dev.db")
)

engine_kwargs = {
    "echo": os.getenv("SQLALCHEMY_ECHO", "false").lower() == "true",
}

if "postgresql" in DATABASE_URL:
    engine_kwargs.update({
        "pool_pre_ping": True,
        "pool_size": int(os.getenv("SQLALCHEMY_POOL_SIZE", "5")),
        "max_overflow": int(os.getenv("SQLALCHEMY_MAX_OVERFLOW", "10")),
    })

engine = create_engine(DATABASE_URL, **engine_kwargs)


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
