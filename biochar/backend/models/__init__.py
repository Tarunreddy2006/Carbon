"""
biochar/backend/models/__init__.py
──────────────────────────────────────────────────────────────────────────────
Public re-export hub for all CarbonOS SQLAlchemy 2.x domain models.
──────────────────────────────────────────────────────────────────────────────
"""

import enum

from biochar.backend.models.base import Base, TimestampMixin, UUIDMixin

# Domain 1: Organization & Auth
from biochar.backend.models.organization import (
    Invitation,
    Organization,
    OrganizationMember,
    Profile,
    Role,
)

# Domain 2: Projects
from biochar.backend.models.project import (
    Project,
    ProjectDocument,
    ProjectSite,
    ProjectTeam,
)

# Domain 3: Feedstock
from biochar.backend.models.feedstock import (
    FeedstockBatch,
    FeedstockDelivery,
    FeedstockQuality,
    FeedstockSupplier,
    FeedstockType,
)

# Domain 4: Plant & Reactor
from biochar.backend.models.plant import (
    ElectricityConsumption,
    FuelConsumption,
    Plant,
    PlantOperator,
    PyrolysisRun,
    Reactor,
    ReactorMaintenance,
    ReactorSensorLog,
)

# Domain 5: Production & Inventory
from biochar.backend.models.production import (
    BiocharApplication,
    BiocharBatch,
    BiocharBatchRun,
    BiocharInventory,
    InventoryMovement,
    Shipment,
    StorageLocation,
)

# Domain 6: Laboratory
from biochar.backend.models.laboratory import (
    BiocharSample,
    Laboratory,
    LaboratoryApproval,
    LaboratoryCertificate,
    LaboratoryParameter,
    LaboratoryResult,
    LaboratoryTest,
)

# Domain 7: Evidence
from biochar.backend.models.evidence import (
    DigitalSignature,
    Evidence,
    EvidenceFile,
    EvidenceReview,
    EvidenceType,
    GPSRecord,
    PhotoMetadata,
)

# Domain 8: Monitoring
from biochar.backend.models.monitoring import (
    CorrectiveAction,
    MonitoringChecklist,
    MonitoringEvent,
    MonitoringIssue,
    MonitoringObservation,
    MonitoringPlan,
    MonitoringSchedule,
)

# Domain 9: Carbon Calculation
from biochar.backend.models.carbon import (
    CalculationInput,
    CalculationMethod,
    CalculationOutput,
    CalculationVersion,
    CarbonCalculation,
    CarbonCreditEstimate,
    EmissionSource,
)

# Domain 10: Registry & Reporting
from biochar.backend.models.registry import (
    Registry,
    RegistryMethodology,
    RegistryReport,
    ReportAttachment,
    ReportSection,
    ReportSubmission,
    ReportVersion,
)

# Domain 11: Verification
from biochar.backend.models.verification import (
    Auditor,
    FindingEvidence,
    FindingResponse,
    VerificationAssignment,
    VerificationCase,
    VerificationCorrectiveAction,
    VerificationDecision,
    VerificationFinding,
    VerificationOrganization,
)

# Domain 12: Workflow & Notifications
from biochar.backend.models.workflow import (
    Notification,
    NotificationPreference,
    NotificationType,
    Task,
    TaskComment,
    WorkflowDefinition,
    WorkflowExecution,
    WorkflowHistory,
    WorkflowStep,
)

# Domain 13: Integration & IoT
from biochar.backend.models.integration import (
    APIKey,
    GPSDevice,
    GPSTracking,
    Integration,
    IntegrationLog,
    IOTDevice,
    IOTReading,
    LaboratoryIntegration,
    Webhook,
    WebhookDelivery,
)

# Domain 14: Billing & Subscriptions
from biochar.backend.models.billing import (
    Coupon,
    Invoice,
    InvoiceItem,
    OrganizationSubscription,
    Payment,
    SubscriptionPlan,
    UsageMetric,
)

# Domain 15: Platform Administration
from biochar.backend.models.admin import (
    Announcement,
    APIRateLimit,
    AuditLog,
    FeatureFlag,
    LoginHistory,
    OrganizationFeature,
    OrganizationSetting,
    SupportTicket,
    SupportTicketReply,
    SystemSetting,
)

# Domain 16: Analytics & Dashboards
from biochar.backend.models.analytics import (
    ActivityTimeline,
    DashboardSnapshot,
    DashboardWidget,
    KPIDefinition,
    OrganizationKPI,
    PerformanceMetric,
    ReportExport,
    SavedReport,
)


# ──────────────────────────────────────────────────────────────────────────────
# Compatibility Enums & Aliases for legacy prototype references
# ──────────────────────────────────────────────────────────────────────────────

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
FeedstockIngest = FeedstockDelivery
PyrolysisTelemetry = ReactorSensorLog
LabAssay = LaboratoryCertificate
DistributionSink = BiocharApplication


__all__ = [
    "Base",
    "UUIDMixin",
    "TimestampMixin",
    # Organization
    "Organization",
    "Profile",
    "Role",
    "OrganizationMember",
    "Invitation",
    # Projects
    "Project",
    "ProjectSite",
    "ProjectTeam",
    "ProjectDocument",
    # Feedstock
    "FeedstockType",
    "FeedstockSupplier",
    "FeedstockBatch",
    "FeedstockDelivery",
    "FeedstockQuality",
    # Plant
    "Plant",
    "Reactor",
    "PlantOperator",
    "PyrolysisRun",
    "ReactorSensorLog",
    "FuelConsumption",
    "ElectricityConsumption",
    "ReactorMaintenance",
    # Production
    "BiocharBatch",
    "BiocharBatchRun",
    "StorageLocation",
    "BiocharInventory",
    "InventoryMovement",
    "Shipment",
    "BiocharApplication",
    # Laboratory
    "Laboratory",
    "BiocharSample",
    "LaboratoryTest",
    "LaboratoryParameter",
    "LaboratoryResult",
    "LaboratoryCertificate",
    "LaboratoryApproval",
    # Evidence
    "EvidenceType",
    "Evidence",
    "EvidenceFile",
    "GPSRecord",
    "PhotoMetadata",
    "DigitalSignature",
    "EvidenceReview",
    # Monitoring
    "MonitoringPlan",
    "MonitoringEvent",
    "MonitoringObservation",
    "MonitoringChecklist",
    "MonitoringIssue",
    "CorrectiveAction",
    "MonitoringSchedule",
    # Carbon
    "CalculationMethod",
    "CarbonCalculation",
    "CalculationInput",
    "CalculationOutput",
    "EmissionSource",
    "CarbonCreditEstimate",
    "CalculationVersion",
    # Registry
    "Registry",
    "RegistryMethodology",
    "RegistryReport",
    "ReportSection",
    "ReportAttachment",
    "ReportSubmission",
    "ReportVersion",
    # Verification
    "VerificationCase",
    "VerificationOrganization",
    "Auditor",
    "VerificationAssignment",
    "VerificationFinding",
    "FindingEvidence",
    "FindingResponse",
    "VerificationCorrectiveAction",
    "VerificationDecision",
    # Workflow
    "NotificationType",
    "Notification",
    "NotificationPreference",
    "Task",
    "TaskComment",
    "WorkflowDefinition",
    "WorkflowStep",
    "WorkflowExecution",
    "WorkflowHistory",
    # Integration
    "Integration",
    "APIKey",
    "Webhook",
    "WebhookDelivery",
    "IOTDevice",
    "IOTReading",
    "GPSDevice",
    "GPSTracking",
    "LaboratoryIntegration",
    "IntegrationLog",
    # Billing
    "SubscriptionPlan",
    "OrganizationSubscription",
    "UsageMetric",
    "Invoice",
    "Payment",
    "InvoiceItem",
    "Coupon",
    # Admin
    "SystemSetting",
    "OrganizationSetting",
    "FeatureFlag",
    "OrganizationFeature",
    "AuditLog",
    "LoginHistory",
    "APIRateLimit",
    "Announcement",
    "SupportTicket",
    "SupportTicketReply",
    # Analytics
    "KPIDefinition",
    "OrganizationKPI",
    "DashboardWidget",
    "SavedReport",
    "ReportExport",
    "DashboardSnapshot",
    "ActivityTimeline",
    "PerformanceMetric",
    # Legacy Compatibility
    "BatchStatus",
    "VerificationTier",
    "FeedstockIngest",
    "PyrolysisTelemetry",
    "LabAssay",
    "DistributionSink",
]
