"""
carbon/biochar/backend/database.py
──────────────────────────────────────────────────────────────────────────────
SQLAlchemy engine, session factory, and declarative base for the biochar
pipeline database.

Configure via the ``BIOCHAR_DATABASE_URL`` environment variable.
Falls back to a local SQLite file for development convenience.
──────────────────────────────────────────────────────────────────────────────
"""

from __future__ import annotations

import os

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

DATABASE_URL: str = os.getenv(
    "DATABASE_URL",
    os.getenv("DATABASE_URL", "sqlite:///./biochar_dev.db"),
)

# For SQLite: enable foreign-key enforcement and allow multithreaded access.
_connect_args: dict = {}
if DATABASE_URL.startswith("sqlite"):
    _connect_args["check_same_thread"] = False

engine = create_engine(
    DATABASE_URL,
    echo=os.getenv("SQLALCHEMY_ECHO", "false").lower() == "true",
    connect_args=_connect_args,
    pool_pre_ping=True,
)

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
)

Base = declarative_base()


def get_db():
    """FastAPI dependency – yields a scoped DB session, auto-closing on exit."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
