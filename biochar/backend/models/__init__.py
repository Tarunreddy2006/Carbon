"""
biochar/backend/models/__init__.py
──────────────────────────────────────────────────────────────────────────────
Public re-export hub for all Stomata SQLAlchemy 2.x domain models.
──────────────────────────────────────────────────────────────────────────────
"""

import enum

from biochar.backend.models.base import Base, TimestampMixin, UUIDMixin
from biochar.backend.models.core import (
    Organization,
    Profile,
    Role,
    OrganizationMember,
    Invitation,
    Project,
    FeedstockBatch,
    PyrolysisRun,
    BiocharBatch,
    ReactorSensorLog,
    BiocharApplication,
    LaboratoryCertificate,
    LaboratoryResult,
    LaboratoryParameter,
    LaboratoryTest,
    BiocharSample,
    FeedstockDelivery,
    FeedstockQuality,
    FeedstockSupplier,
    FeedstockType,
    Plant,
    Reactor,
    PlantOperator,
    FuelConsumption,
    ElectricityConsumption,
    ReactorMaintenance,
    BiocharBatchRun,
    StorageLocation,
    BiocharInventory,
    InventoryMovement,
    Shipment,
    Laboratory,
    LaboratoryApproval,
    Evidence,
    EvidenceFile,
    EvidenceReview,
    EvidenceAIResult,
    EvidenceAuditLog,
    MassBalanceConfig,
    MassBalanceAnomaly,
    LaboratoryValidationConfig,
    LaboratoryValidationLog,
    FeedstockSupplier,
    FeedstockIntelligenceConfig,
    FeedstockIntelligenceLog,
)


class BatchStatus(str, enum.Enum):
    """Lifecycle states a biochar batch moves through."""
    sourcing_purgatory = "sourcing_purgatory"
    processing_active = "processing_active"
    lab_certified = "lab_certified"
    completed = "completed"
    ineligible = "ineligible"


class VerificationTier(str, enum.Enum):
    """Lab permanence classification tiers."""
    pending = "pending"
    standard_200yr = "standard_200yr"
    high_permanence_1000yr = "high_permanence_1000yr"


# Backward-compatible class aliases mapping old prototype names to new production models
FeedstockIngest = FeedstockBatch
PyrolysisTelemetry = ReactorSensorLog
LabAssay = LaboratoryCertificate
DistributionSink = BiocharApplication

__all__ = [
    "Base",
    "UUIDMixin",
    "TimestampMixin",
    "Organization",
    "Profile",
    "Role",
    "OrganizationMember",
    "Invitation",
    "Project",
    "FeedstockBatch",
    "PyrolysisRun",
    "BiocharBatch",
    "ReactorSensorLog",
    "BiocharApplication",
    "LaboratoryCertificate",
    "LaboratoryResult",
    "LaboratoryParameter",
    "LaboratoryTest",
    "BiocharSample",
    "FeedstockDelivery",
    "FeedstockQuality",
    "FeedstockSupplier",
    "FeedstockType",
    "Plant",
    "Reactor",
    "PlantOperator",
    "FuelConsumption",
    "ElectricityConsumption",
    "ReactorMaintenance",
    "BiocharBatchRun",
    "StorageLocation",
    "BiocharInventory",
    "InventoryMovement",
    "Shipment",
    "Laboratory",
    "LaboratoryApproval",
    "Evidence",
    "EvidenceFile",
    "EvidenceReview",
    "EvidenceAIResult",
    "EvidenceAuditLog",
    "MassBalanceConfig",
    "MassBalanceAnomaly",
    "LaboratoryValidationConfig",
    "LaboratoryValidationLog",
    "FeedstockSupplier",
    "FeedstockIntelligenceConfig",
    "FeedstockIntelligenceLog",
    "BatchStatus",
    "VerificationTier",
    "FeedstockIngest",
    "PyrolysisTelemetry",
    "LabAssay",
    "DistributionSink",
]



