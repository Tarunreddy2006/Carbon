"""
database/models.py
─────────────────────────────────────────────────────────────────────────────
Database schema defining the physical land parcels, cryptographic carbon 
credits, and the split user architecture (Farmers vs Institutions).
─────────────────────────────────────────────────────────────────────────────
"""
import uuid
import enum
from datetime import datetime

from sqlalchemy import Column, String, Float, DateTime, ForeignKey, Enum, Integer
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship
from geoalchemy2 import Geometry

from .db import Base

class CreditStatus(enum.Enum):
    PROJECTED = "PROJECTED"
    VERIFIED = "VERIFIED"
    ISSUED = "ISSUED"
    RETIRED = "RETIRED"
    FLAGGED = "FLAGGED"

class JobStatus(enum.Enum):
    PENDING = "PENDING"
    PROCESSING = "PROCESSING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"

# ==========================================
# BULK PARCEL AUDIT ARCHITECTURE
# ==========================================

class BulkJob(Base):
    """
    Parent tracking entry for a bulk CSV audit job.
    Each uploaded CSV file spawns one BulkJob containing N child BulkItems.
    """
    __tablename__ = 'bulk_jobs'

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(String, index=True, nullable=False)
    filename = Column(String, nullable=False)
    status = Column(Enum(JobStatus), default=JobStatus.PENDING, nullable=False)
    total_rows = Column(Integer, nullable=False, default=0)
    processed_rows = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)

    items = relationship("BulkItem", back_populates="job", cascade="all, delete-orphan",
                         order_by="BulkItem.row_index")

class BulkItem(Base):
    """
    Child record mapping a single CSV row to its downstream carbon metrics.
    Each item runs independently through the GEE + carbon pipeline.
    """
    __tablename__ = 'bulk_items'

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    job_id = Column(UUID(as_uuid=True), ForeignKey('bulk_jobs.id', ondelete='CASCADE'),
                    nullable=False, index=True)
    row_index = Column(Integer, nullable=False)

    # ── Raw CSV Inputs ────────────────────────────────────────────────────
    parcel_label = Column(String, nullable=True)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    radius_meters = Column(Float, nullable=False, default=500.0)

    # ── Processing State ──────────────────────────────────────────────────
    status = Column(Enum(JobStatus), default=JobStatus.PENDING, nullable=False)
    error_message = Column(String, nullable=True)

    # ── Downstream Calculated Metrics ─────────────────────────────────────
    calculated_area_ha = Column(Float, nullable=True)
    ndvi_mean = Column(Float, nullable=True)
    co2_equivalent_tons = Column(Float, nullable=True)
    confidence_score = Column(Float, nullable=True)

    job = relationship("BulkJob", back_populates="items")

# ==========================================
# USER ARCHITECTURE (Concrete Table Inheritance)
# ==========================================

class Farmer(Base):
    """Database table specifically for Field App users (Farmers)."""
    __tablename__ = 'farmers'
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    username = Column(String, unique=True, index=True)
    password_hash = Column(String, nullable=False)
    
    # Farmer-specific columns
    mobile_number = Column(String)
    region = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow)

class Institution(Base):
    """Database table specifically for Pro Dashboard users (Auditors/Buyers)."""
    __tablename__ = 'institutions'
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    username = Column(String, unique=True, index=True)
    password_hash = Column(String, nullable=False)
    
    # Institution-specific columns
    company_name = Column(String)
    tax_id = Column(String)
    registry_tier = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow)

# ==========================================
# CARBON ASSET ARCHITECTURE
# ==========================================

class ParcelRecord(Base):
    """PostGIS table for storing the physical land boundaries."""
    __tablename__ = 'parcels'
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    farm_id = Column(String, index=True, nullable=True) # Optional link to a user/farm
    user_id = Column(String, index=True, nullable=True) # The actual owner (from JWT sub)
    boundary = Column(Geometry(geometry_type='POLYGON', srid=4326), nullable=False)
    source_type = Column(String) # E.g., 'GPS_WALK', 'MANUAL_DRAW', 'K-GIS'
    calculated_area_ha = Column(Float)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    credits = relationship("CarbonCredit", back_populates="parcel")

class CarbonCredit(Base):
    """The digital ledger for carbon assets tracked over time."""
    __tablename__ = 'carbon_credits'
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    parcel_id = Column(UUID(as_uuid=True), ForeignKey('parcels.id'))
    vintage_year = Column(String(4), nullable=False)
    unique_code = Column(String, unique=True, index=True)
    estimated_co2e = Column(Float, nullable=False)
    status = Column(Enum(CreditStatus), default=CreditStatus.PROJECTED)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # 🟢 Cryptographic Anchoring
    data_hash = Column(String, unique=True, index=True)
    raw_payload = Column(JSONB) # Stores the exact JSON that was hashed
    
    parcel = relationship("ParcelRecord", back_populates="credits")

class Ecoregion(Base):
    __tablename__ = "ecoregions"
    id = Column(Integer, primary_key=True, index=True)
    biome_name = Column(String, nullable=False)
    geom = Column(Geometry(geometry_type='MULTIPOLYGON', srid=4326), nullable=False)