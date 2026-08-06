"""
biochar/backend/mass_balance.py
──────────────────────────────────────────────────────────────────────────────
Mass Balance & Anomaly Engine for Stomata Biochar Platform.
Handles wet/dry biomass calculations, moisture water mass, production yield,
threshold evaluations, anomaly flag generation, and audit logging.
──────────────────────────────────────────────────────────────────────────────
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple, Any
import uuid
from sqlalchemy.orm import Session
from sqlalchemy import select

from biochar.backend.models import (
    FeedstockBatch,
    BiocharBatch,
    MassBalanceConfig,
    MassBalanceAnomaly,
    EvidenceAuditLog,
    PyrolysisRun,
)

logger = logging.getLogger("biochar_mass_balance")

# Default Organization Thresholds
DEFAULT_MIN_YIELD_PERCENT = 15.0
DEFAULT_MAX_YIELD_PERCENT = 50.0
DEFAULT_MAX_MOISTURE_PERCENT = 65.0


class AnomalyResult:
    def __init__(
        self,
        severity: str,
        category: str,
        explanation: str,
        rule_id: str,
    ):
        self.severity = severity
        self.category = category
        self.explanation = explanation
        self.rule_id = rule_id
        self.timestamp = datetime.now(timezone.utc).isoformat()

    def to_dict(self) -> Dict[str, Any]:
        return {
            "severity": self.severity,
            "category": self.category,
            "explanation": self.explanation,
            "rule_id": self.rule_id,
            "timestamp": self.timestamp,
        }


class MassBalanceService:
    """Core service for biomass mass balance calculations & anomaly detection."""

    @staticmethod
    def calculate_dry_matter(wet_weight_kg: float, moisture_percent: float) -> Tuple[float, float]:
        """
        Calculate dry biomass weight and water weight from wet mass and moisture percentage.
        Formulas:
          dry_weight_kg = wet_weight_kg * (1 - moisture_percent / 100)
          water_weight_kg = wet_weight_kg * (moisture_percent / 100)
        """
        if wet_weight_kg is None or moisture_percent is None:
            raise ValueError("Wet weight and moisture percentage are required for dry matter calculation.")

        if wet_weight_kg < 0:
            raise ValueError(f"Invalid negative wet weight: {wet_weight_kg} kg")
        if moisture_percent < 0 or moisture_percent > 100:
            raise ValueError(f"Invalid moisture percentage: {moisture_percent}%")

        dry_weight_kg = wet_weight_kg * (1.0 - (moisture_percent / 100.0))
        water_weight_kg = wet_weight_kg * (moisture_percent / 100.0)

        return round(dry_weight_kg, 3), round(water_weight_kg, 3)

    @staticmethod
    def calculate_production_yield(produced_weight_kg: float, dry_weight_kg: float) -> float:
        """
        Calculate biochar yield percentage based on dry biomass input weight.
        Formula:
          yield_percent = (produced_weight_kg / dry_weight_kg) * 100
        """
        if dry_weight_kg is None or dry_weight_kg <= 0:
            raise ValueError("Dry weight must be greater than zero to compute production yield.")
        if produced_weight_kg is None or produced_weight_kg < 0:
            raise ValueError(f"Invalid produced weight: {produced_weight_kg} kg")

        yield_percent = (produced_weight_kg / dry_weight_kg) * 100.0
        return round(yield_percent, 2)

    @staticmethod
    def get_organization_config(db: Session, organization_id: Optional[uuid.UUID] = None) -> MassBalanceConfig:
        """Fetch organization-specific mass balance threshold configuration or default."""
        if organization_id:
            config = db.query(MassBalanceConfig).filter(MassBalanceConfig.organization_id == organization_id).first()
            if config:
                return config

        # Return non-persisted default config
        default_cfg = MassBalanceConfig(
            organization_id=organization_id,
            min_yield_percent=DEFAULT_MIN_YIELD_PERCENT,
            max_yield_percent=DEFAULT_MAX_YIELD_PERCENT,
            max_moisture_percent=DEFAULT_MAX_MOISTURE_PERCENT,
        )
        return default_cfg

    @classmethod
    def evaluate_feedstock(
        cls,
        db: Session,
        feedstock_batch: FeedstockBatch,
        organization_id: Optional[uuid.UUID] = None,
        project_id: Optional[uuid.UUID] = None,
    ) -> List[AnomalyResult]:
        """
        Evaluates mass balance calculations and anomaly detection rules for a FeedstockBatch.
        Updates feedstock_batch calculations (wet_weight_kg, dry_weight_kg, water_weight_kg).
        """
        anomalies: List[AnomalyResult] = []
        config = cls.get_organization_config(db, organization_id)

        wet_weight = feedstock_batch.wet_weight_kg if feedstock_batch.wet_weight_kg is not None else feedstock_batch.weight_kg
        moisture = feedstock_batch.moisture_percent

        # Rule 1: Missing Mandatory Measurements
        if wet_weight is None:
            anomalies.append(
                AnomalyResult(
                    severity="High",
                    category="Missing Measurement",
                    explanation="Feedstock wet weight (wet_weight_kg) is missing.",
                    rule_id="RULE_MISSING_WET_WEIGHT",
                )
            )

        if moisture is None:
            anomalies.append(
                AnomalyResult(
                    severity="High",
                    category="Missing Measurement",
                    explanation="Feedstock moisture percentage (moisture_percent) is missing.",
                    rule_id="RULE_MISSING_MOISTURE",
                )
            )

        # Rule 2: Negative or Impossible Values
        if wet_weight is not None and wet_weight <= 0:
            anomalies.append(
                AnomalyResult(
                    severity="Critical",
                    category="Invalid Input",
                    explanation=f"Feedstock wet weight ({wet_weight} kg) must be greater than zero.",
                    rule_id="RULE_INVALID_WET_WEIGHT",
                )
            )

        if moisture is not None and (moisture < 0 or moisture > 100):
            anomalies.append(
                AnomalyResult(
                    severity="Critical",
                    category="Invalid Input",
                    explanation=f"Moisture content ({moisture}%) is impossible (must be 0-100%).",
                    rule_id="RULE_INVALID_MOISTURE",
                )
            )

        # Calculate dry matter if inputs are valid
        if wet_weight is not None and wet_weight > 0 and moisture is not None and 0 <= moisture <= 100:
            dry_weight, water_weight = cls.calculate_dry_matter(wet_weight, moisture)
            feedstock_batch.wet_weight_kg = wet_weight
            feedstock_batch.weight_kg = wet_weight
            feedstock_batch.dry_weight_kg = dry_weight
            feedstock_batch.water_weight_kg = water_weight

            # Rule 3: Moisture Above Threshold
            if moisture > config.max_moisture_percent:
                anomalies.append(
                    AnomalyResult(
                        severity="High",
                        category="Moisture Anomaly",
                        explanation=f"Measured moisture content ({moisture:.1f}%) exceeds maximum threshold ({config.max_moisture_percent:.1f}%).",
                        rule_id="RULE_EXCESSIVE_MOISTURE",
                    )
                )

        # Persist anomalies to DB if present
        cls._sync_anomalies(
            db,
            entity_type="feedstock_batch",
            entity_id=feedstock_batch.id,
            organization_id=organization_id,
            project_id=project_id or feedstock_batch.project_id,
            anomalies=anomalies,
        )

        # Log audit entry
        cls._log_audit(
            db,
            action="FEEDSTOCK_MASS_BALANCE_EVALUATION",
            details={
                "batch_code": feedstock_batch.batch_code,
                "wet_weight_kg": feedstock_batch.wet_weight_kg,
                "dry_weight_kg": feedstock_batch.dry_weight_kg,
                "moisture_percent": feedstock_batch.moisture_percent,
                "anomalies_count": len(anomalies),
            },
        )

        return anomalies

    @classmethod
    def evaluate_biochar_batch(
        cls,
        db: Session,
        biochar_batch: BiocharBatch,
        organization_id: Optional[uuid.UUID] = None,
        project_id: Optional[uuid.UUID] = None,
    ) -> List[AnomalyResult]:
        """
        Evaluates mass balance yield and anomaly detection rules for a BiocharBatch.
        Finds associated PyrolysisRun -> FeedstockBatch -> dry_weight_kg.
        """
        anomalies: List[AnomalyResult] = []
        config = cls.get_organization_config(db, organization_id)

        produced_weight = biochar_batch.produced_weight_kg if biochar_batch.produced_weight_kg is not None else biochar_batch.weight_kg

        if produced_weight is not None:
            biochar_batch.produced_weight_kg = produced_weight
            biochar_batch.weight_kg = produced_weight

        # Rule 1: Missing mandatory measurement
        if produced_weight is None:
            anomalies.append(
                AnomalyResult(
                    severity="High",
                    category="Missing Measurement",
                    explanation="Biochar produced weight (produced_weight_kg) is missing.",
                    rule_id="RULE_MISSING_PRODUCED_WEIGHT",
                )
            )

        # Rule 2: Impossible produced weight
        if produced_weight is not None and produced_weight <= 0:
            anomalies.append(
                AnomalyResult(
                    severity="Critical",
                    category="Invalid Input",
                    explanation=f"Biochar produced weight ({produced_weight} kg) must be greater than zero.",
                    rule_id="RULE_INVALID_PRODUCED_WEIGHT",
                )
            )

        # Fetch PyrolysisRun & FeedstockBatch dry weight
        dry_weight_kg: Optional[float] = None
        expected_yield: float = DEFAULT_MIN_YIELD_PERCENT

        if biochar_batch.pyrolysis_run:
            pyrolysis_run = biochar_batch.pyrolysis_run
            if pyrolysis_run.feedstock_batch:
                fs = pyrolysis_run.feedstock_batch
                dry_weight_kg = fs.dry_weight_kg
                if fs.expected_yield_percent:
                    expected_yield = fs.expected_yield_percent
                if not project_id:
                    project_id = fs.project_id

        if dry_weight_kg is None or dry_weight_kg <= 0:
            anomalies.append(
                AnomalyResult(
                    severity="Medium",
                    category="Missing Measurement",
                    explanation="Associated feedstock dry biomass weight is missing or zero. Cannot calculate production yield.",
                    rule_id="RULE_MISSING_FEEDSTOCK_DRY_WEIGHT",
                )
            )
        elif produced_weight is not None and produced_weight > 0:
            actual_yield = cls.calculate_production_yield(produced_weight, dry_weight_kg)
            biochar_batch.calculated_yield_percent = actual_yield

            # Rule 4: Yield below minimum threshold
            if actual_yield < config.min_yield_percent:
                anomalies.append(
                    AnomalyResult(
                        severity="High",
                        category="Yield Anomaly",
                        explanation=f"Calculated biochar yield ({actual_yield:.1f}%) is below minimum threshold ({config.min_yield_percent:.1f}%). Expected ~{expected_yield:.1f}%.",
                        rule_id="RULE_YIELD_BELOW_MINIMUM",
                    )
                )

            # Rule 5: Yield above maximum threshold
            if actual_yield > config.max_yield_percent:
                anomalies.append(
                    AnomalyResult(
                        severity="Critical",
                        category="Yield Anomaly",
                        explanation=f"Calculated biochar yield ({actual_yield:.1f}%) exceeds maximum physical threshold ({config.max_yield_percent:.1f}%). Potential mass imbalance.",
                        rule_id="RULE_YIELD_ABOVE_MAXIMUM",
                    )
                )

        # Update batch status fields based on anomalies
        if anomalies:
            biochar_batch.anomaly_status = "Flagged"
            biochar_batch.mass_balance_status = "Anomaly"
            biochar_batch.anomaly_reason = "; ".join([a.explanation for a in anomalies])
        else:
            biochar_batch.anomaly_status = "Normal"
            biochar_batch.mass_balance_status = "Pass"
            biochar_batch.anomaly_reason = None

        # Persist anomalies to DB
        cls._sync_anomalies(
            db,
            entity_type="biochar_batch",
            entity_id=biochar_batch.id,
            organization_id=organization_id,
            project_id=project_id,
            anomalies=anomalies,
        )

        # Log audit entry
        cls._log_audit(
            db,
            action="BIOCHAR_MASS_BALANCE_EVALUATION",
            details={
                "batch_code": biochar_batch.batch_code,
                "produced_weight_kg": biochar_batch.produced_weight_kg,
                "calculated_yield_percent": biochar_batch.calculated_yield_percent,
                "mass_balance_status": biochar_batch.mass_balance_status,
                "anomaly_status": biochar_batch.anomaly_status,
                "anomalies_count": len(anomalies),
            },
        )

        return anomalies

    @classmethod
    def _sync_anomalies(
        cls,
        db: Session,
        entity_type: str,
        entity_id: uuid.UUID,
        organization_id: Optional[uuid.UUID],
        project_id: Optional[uuid.UUID],
        anomalies: List[AnomalyResult],
    ) -> None:
        """Syncs active anomalies in mass_balance_anomalies table."""
        # Resolve previous active anomalies for this entity that are no longer reported
        existing_active = (
            db.query(MassBalanceAnomaly)
            .filter(
                MassBalanceAnomaly.entity_type == entity_type,
                MassBalanceAnomaly.entity_id == entity_id,
                MassBalanceAnomaly.status == "Active",
            )
            .all()
        )

        # If clean, resolve existing active anomalies
        if not anomalies:
            for ex in existing_active:
                ex.status = "Resolved"
                ex.resolved_at = datetime.now(timezone.utc)
            return

        # Insert new anomalies if not already present
        existing_explanations = {ex.human_readable_explanation for ex in existing_active}
        for a in anomalies:
            if a.explanation not in existing_explanations:
                db_anomaly = MassBalanceAnomaly(
                    organization_id=organization_id,
                    project_id=project_id,
                    entity_type=entity_type,
                    entity_id=entity_id,
                    severity=a.severity,
                    category=a.category,
                    human_readable_explanation=a.explanation,
                    status="Active",
                    created_at=datetime.now(timezone.utc),
                )
                db.add(db_anomaly)

    @classmethod
    def _log_audit(cls, db: Session, action: str, details: Dict[str, Any]) -> None:
        """Write mass balance audit event to evidence_audit_logs."""
        try:
            audit_entry = EvidenceAuditLog(
                action=action,
                details=details,
                created_at=datetime.now(timezone.utc),
            )
            db.add(audit_entry)
            logger.info("Mass Balance Audit Event [%s]: %s", action, details)
        except Exception as exc:
            logger.warning("Could not persist audit log: %s", exc)
