import uuid
import enum
from datetime import datetime
from sqlalchemy import Column, String, Float, DateTime, ForeignKey, Enum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from geoalchemy2 import Geometry

from .db import Base

class CreditStatus(enum.Enum):
    PROJECTED = "PROJECTED"
    VERIFIED = "VERIFIED"
    ISSUED = "ISSUED"
    RETIRED = "RETIRED"

class ParcelRecord(Base):
    """PostGIS table for storing the physical land boundaries."""
    __tablename__ = 'parcels'
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    farm_id = Column(String, index=True, nullable=True) # Optional link to a user/farm
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
    
    parcel = relationship("ParcelRecord", back_populates="credits")