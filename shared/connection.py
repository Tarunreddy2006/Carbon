import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, scoped_session

# Default fallback URL maps to local Postgres cluster instance
DATABASE_URL = os.getenv(
    "DATABASE_URL", 
    "postgresql://postgres:postgres@localhost:5432/carbon"
)

# Initialize production-grade connection pool configuration
engine = create_engine(
    DATABASE_URL,
    pool_size=20,
    max_overflow=10,
    pool_pre_ping=True,       # Ensures connection liveness checks before running commands
    pool_recycle=3600         # Recycles sockets hourly to prevent stale connection drops
)

db_session = scoped_session(
    sessionmaker(
        autocommit=False, 
        autoflush=False, 
        bind=engine
    )
)

def get_db():
    """
    Context generator hook to provide thread-safe database sessions
    and guarantee clean structural transaction teardowns.
    """
    db = db_session()
    try:
        yield db
    finally:
        db.close()