"""
biochar/backend/lab_validation.py
──────────────────────────────────────────────────────────────────────────────
Laboratory Validation & Anomaly Engine for Stomata Biochar Platform (Phase 2).
Rule-based pre-validation system that evaluates production parameters,
mass balance metrics, evidence completeness, and sample readiness before
laboratory analysis to reduce costs and enhance quality assurance.
──────────────────────────────────────────────────────────────────────────────
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple, Any
import uuid
from sqlalchemy.orm import Session

from biochar.backend.models import (
    BiocharBatch,
    BiocharSample,
    PyrolysisRun,
    FeedstockBatch,
    Evidence,
    LaboratoryValidationConfig,
    LaboratoryValidationLog,
    EvidenceAuditLog,
)

logger = logging.getLogger("biochar_lab_validation")

# Default Threshold Constants
DEFAULT_MIN_PEAK_TEMP = 450.0       # °C
DEFAULT_MIN_RESIDENCE_TIME = 30     # minutes
DEFAULT_MAX_MOISTURE_PCT = 65.0     # %
DEFAULT_REQUIRED_EVIDENCE = ["feedstock", "pyrolysis", "batch"]


class ValidationRuleResult:
    def __init__(
        self,
        rule_id: str,
        category: str,
        severity: str,  # 'Pass', 'Warning', 'High Risk', 'Hold Batch'
        explanation: str,
        recommendation: Optional[str] = None,
    ):
        self.rule_id = rule_id
        self.category = category
        self.severity = severity
        self.explanation = explanation
        self.recommendation = recommendation
        self.timestamp = datetime.now(timezone.utc).isoformat()

    def to_dict(self) -> Dict[str, Any]:
        return {
            "rule_id": self.rule_id,
            "category": self.category,
            "severity": self.severity,
            "explanation": self.explanation,
            "recommendation": self.recommendation,
            "timestamp": self.timestamp,
        }


class ValidationScoreService:
    """Calculates multi-component Laboratory Validation Score (0-100%)."""

    @staticmethod
    def calculate_score(
        has_production_params: bool,
        temp_ok: bool,
        residence_ok: bool,
        has_sample: bool,
        evidence_count: int,
        required_evidence_count: int,
        mass_balance_pass: bool,
    ) -> Tuple[float, Dict[str, float]]:
        """
        Scoring weights (25% each):
        1. Production Parameters (25%): Peak temp & residence time present and valid
        2. Laboratory Sample (25%): Sample collected & sample code assigned
        3. Evidence (25%): Percentage of required evidence types uploaded
        4. Mass Balance (25%): Mass balance calculated without anomaly flags
        """
        # 1. Production Score (max 25)
        prod_score = 0.0
        if has_production_params:
            prod_score += 10.0
        if temp_ok:
            prod_score += 7.5
        if residence_ok:
            prod_score += 7.5

        # 2. Sample Score (max 25)
        sample_score = 25.0 if has_sample else 0.0

        # 3. Evidence Score (max 25)
        req_count = max(required_evidence_count, 1)
        ev_ratio = min(evidence_count / req_count, 1.0)
        evidence_score = round(ev_ratio * 25.0, 1)

        # 4. Mass Balance Score (max 25)
        mb_score = 25.0 if mass_balance_pass else 10.0

        overall_score = round(prod_score + sample_score + evidence_score + mb_score, 1)

        breakdown = {
            "production_parameters_score": prod_score,
            "laboratory_sample_score": sample_score,
            "evidence_score": evidence_score,
            "mass_balance_score": mb_score,
            "overall_validation_score": overall_score,
        }

        return overall_score, breakdown


class ValidationRuleEngine:
    """Executes rule-based checks on Biochar Batches for Lab Pre-Validation."""

    @classmethod
    def evaluate(
        cls,
        db: Session,
        batch: BiocharBatch,
        config: LaboratoryValidationConfig,
    ) -> Tuple[List[ValidationRuleResult], str, str, bool]:
        """
        Evaluates batch against rules and returns:
          (rule_results, overall_status, risk_level, laboratory_ready)
        """
        rule_results: List[ValidationRuleResult] = []

        # Extract Pyrolysis Run & Feedstock Batch
        run: Optional[PyrolysisRun] = batch.pyrolysis_run
        feedstock: Optional[FeedstockBatch] = run.feedstock_batch if run else None

        peak_temp = batch.peak_temperature or (run.maximum_temperature if run else None)
        residence_time = batch.residence_time_minutes or (run.residence_time_minutes if run else None)
        produced_weight = batch.produced_weight_kg or batch.weight_kg
        moisture = feedstock.moisture_percent if feedstock else None

        # Rule 1: Temperature Validation
        if peak_temp is not None:
            if peak_temp < config.min_peak_temperature:
                rule_results.append(
                    ValidationRuleResult(
                        rule_id="RULE_TEMP_LOW",
                        category="Temperature Validation",
                        severity="Warning",
                        explanation=f"Peak temperature ({peak_temp:.1f}°C) is below minimum threshold ({config.min_peak_temperature:.1f}°C).",
                        recommendation="Low carbonization expected. Increase kiln operating temperature for next batch.",
                    )
                )
        else:
            rule_results.append(
                ValidationRuleResult(
                    rule_id="RULE_MISSING_TEMP",
                    category="Missing Production Parameters",
                    severity="High Risk",
                    explanation="Peak operating temperature record is missing.",
                    recommendation="Log kiln peak temperature parameter.",
                )
            )

        # Rule 2: Residence Time Validation
        if residence_time is not None:
            if residence_time < config.min_residence_time_minutes:
                rule_results.append(
                    ValidationRuleResult(
                        rule_id="RULE_RESIDENCE_TIME_LOW",
                        category="Residence Time Validation",
                        severity="Warning",
                        explanation=f"Residence time ({residence_time} mins) is below minimum required ({config.min_residence_time_minutes} mins).",
                        recommendation="Incomplete pyrolysis possible. Ensure minimum required residence duration.",
                    )
                )
        else:
            rule_results.append(
                ValidationRuleResult(
                    rule_id="RULE_MISSING_RESIDENCE_TIME",
                    category="Missing Production Parameters",
                    severity="High Risk",
                    explanation="Pyrolysis residence time record is missing.",
                    recommendation="Record reactor residence time duration.",
                )
            )

        # Rule 3: Moisture Validation (from Phase 1 Mass Balance)
        if moisture is not None:
            if moisture > config.max_moisture_percent:
                rule_results.append(
                    ValidationRuleResult(
                        rule_id="RULE_MOISTURE_EXCESSIVE",
                        category="Moisture Validation",
                        severity="Warning",
                        explanation=f"Feedstock moisture content ({moisture:.1f}%) exceeds maximum limit ({config.max_moisture_percent:.1f}%).",
                        recommendation="Feedstock moisture may reduce biochar fixed carbon quality. Pre-dry biomass.",
                    )
                )

        # Rule 4: Missing Laboratory Sample
        samples = batch.samples if hasattr(batch, 'samples') and batch.samples else []
        has_sample = len(samples) > 0
        if not has_sample:
            rule_results.append(
                ValidationRuleResult(
                    rule_id="RULE_MISSING_SAMPLE",
                    category="Missing Laboratory Sample",
                    severity="High Risk",
                    explanation="No physical laboratory sample collected for this batch.",
                    recommendation="Collect biochar sample and assign sample ID before submitting to lab.",
                )
            )

        # Rule 5: Missing Evidence
        ev_records = db.query(Evidence).filter(Evidence.entity_id == batch.id).all()
        required_types = config.required_evidence_types or DEFAULT_REQUIRED_EVIDENCE
        if len(ev_records) == 0:
            rule_results.append(
                ValidationRuleResult(
                    rule_id="RULE_MISSING_EVIDENCE",
                    category="Missing Evidence",
                    severity="High Risk",
                    explanation="Required evidence files (photos/tickets) are missing for this batch.",
                    recommendation="Upload kiln operations or batch storage photo evidence.",
                )
            )

        # Rule 6: Missing Production Parameters
        if produced_weight is None or produced_weight <= 0:
            rule_results.append(
                ValidationRuleResult(
                    rule_id="RULE_MISSING_PRODUCED_WEIGHT",
                    category="Missing Production Parameters",
                    severity="High Risk",
                    explanation="Produced biochar mass (produced_weight_kg) is missing or zero.",
                    recommendation="Weigh biochar lot and log produced mass.",
                )
            )

        # Classify overall status & risk level
        severities = {r.severity for r in rule_results}

        if "Hold Batch" in severities or len([r for r in rule_results if r.severity == "High Risk"]) >= 3:
            overall_status = "Hold Batch"
            risk_level = "Critical"
            lab_ready = False
        elif "High Risk" in severities:
            overall_status = "High Risk"
            risk_level = "High"
            lab_ready = False
        elif "Warning" in severities:
            overall_status = "Warning"
            risk_level = "Medium"
            lab_ready = True
        else:
            overall_status = "Pass"
            risk_level = "Low"
            lab_ready = True

        return rule_results, overall_status, risk_level, lab_ready


class LaboratoryValidationService:
    """Core orchestration service for Laboratory Validation & Anomaly Engine."""

    @staticmethod
    def get_config(db: Session, organization_id: Optional[uuid.UUID] = None) -> LaboratoryValidationConfig:
        """Fetch organization-specific validation thresholds or defaults."""
        if organization_id:
            cfg = db.query(LaboratoryValidationConfig).filter(
                LaboratoryValidationConfig.organization_id == organization_id
            ).first()
            if cfg:
                return cfg

        return LaboratoryValidationConfig(
            organization_id=organization_id,
            min_peak_temperature=DEFAULT_MIN_PEAK_TEMP,
            min_residence_time_minutes=DEFAULT_MIN_RESIDENCE_TIME,
            max_moisture_percent=DEFAULT_MAX_MOISTURE_PCT,
            required_evidence_types=DEFAULT_REQUIRED_EVIDENCE,
            required_laboratory_fields=["sample_code", "collection_date"],
        )

    @classmethod
    def validate_batch(
        cls,
        db: Session,
        batch_id: uuid.UUID,
        organization_id: Optional[uuid.UUID] = None,
        user_id: Optional[uuid.UUID] = None,
    ) -> Dict[str, Any]:
        """
        Executes complete lab pre-validation pipeline for a batch.
        Updates DB fields, calculates score, writes validation log, and returns report summary.
        """
        batch = db.query(BiocharBatch).filter(BiocharBatch.id == batch_id).first()
        if not batch:
            raise ValueError(f"BiocharBatch with ID {batch_id} not found.")

        config = cls.get_config(db, organization_id)

        # 1. Run Rule Engine
        rule_results, overall_status, risk_level, lab_ready = ValidationRuleEngine.evaluate(db, batch, config)

        # 2. Calculate Validation Score
        run = batch.pyrolysis_run
        feedstock = run.feedstock_batch if run else None
        peak_temp = batch.peak_temperature or (run.maximum_temperature if run else None)
        residence_time = batch.residence_time_minutes or (run.residence_time_minutes if run else None)
        samples = batch.samples if hasattr(batch, 'samples') and batch.samples else []
        ev_records = db.query(Evidence).filter(Evidence.entity_id == batch.id).all()

        has_params = (peak_temp is not None) and (residence_time is not None) and (batch.produced_weight_kg is not None)
        temp_ok = (peak_temp is not None) and (peak_temp >= config.min_peak_temperature)
        res_ok = (residence_time is not None) and (residence_time >= config.min_residence_time_minutes)
        has_sample = len(samples) > 0
        req_ev_count = len(config.required_evidence_types or DEFAULT_REQUIRED_EVIDENCE)
        mb_pass = (batch.mass_balance_status != "Anomaly") and (batch.anomaly_status != "Flagged")

        score, score_breakdown = ValidationScoreService.calculate_score(
            has_production_params=has_params,
            temp_ok=temp_ok,
            residence_ok=res_ok,
            has_sample=has_sample,
            evidence_count=len(ev_records),
            required_evidence_count=req_ev_count,
            mass_balance_pass=mb_pass,
        )

        prev_status = batch.validation_status

        # 3. Update Batch DB fields
        batch.validation_status = overall_status
        batch.quality_status = overall_status
        batch.validation_score = score
        batch.laboratory_ready = lab_ready
        batch.anomaly_count = len(rule_results)

        # Also update associated BiocharSample if present
        for sample in samples:
            sample.validation_status = overall_status
            sample.risk_level = risk_level
            sample.validation_score = score

        # 4. Write Validation Log Audit Entry
        val_log = LaboratoryValidationLog(
            organization_id=organization_id,
            project_id=feedstock.project_id if feedstock else None,
            batch_id=batch.id,
            rule_triggered=";".join([r.rule_id for r in rule_results]) if rule_results else "ALL_RULES_PASSED",
            previous_status=prev_status,
            new_status=overall_status,
            validation_score=score,
            risk_level=risk_level,
            details={
                "anomalies_count": len(rule_results),
                "score_breakdown": score_breakdown,
                "warnings": [r.to_dict() for r in rule_results],
            },
            evaluated_by=user_id,
            created_at=datetime.now(timezone.utc),
        )
        db.add(val_log)

        # Log evidence audit log
        audit_entry = EvidenceAuditLog(
            user_id=user_id,
            action="LABORATORY_PRE_VALIDATION",
            details={
                "batch_id": str(batch.id),
                "batch_code": batch.batch_code,
                "previous_status": prev_status,
                "new_status": overall_status,
                "validation_score": score,
                "laboratory_ready": lab_ready,
            },
            created_at=datetime.now(timezone.utc),
        )
        db.add(audit_entry)

        db.commit()

        # 5. Build Summary & Recommendations Report
        warnings = [r for r in rule_results if r.severity in ("Warning", "High Risk", "Hold Batch")]
        recommendations = [r.recommendation for r in rule_results if r.recommendation]

        return {
            "status": "success",
            "batch_id": str(batch.id),
            "batch_code": batch.batch_code,
            "validation_status": overall_status,
            "risk_level": risk_level,
            "validation_score": score,
            "score_breakdown": score_breakdown,
            "laboratory_ready": lab_ready,
            "readiness_checklist": {
                "sample_collected": has_sample,
                "production_complete": has_params,
                "mass_balance_ok": mb_pass,
                "evidence_complete": len(ev_records) >= req_ev_count,
            },
            "warnings": [w.to_dict() for w in warnings],
            "recommendations": recommendations,
        }


class LaboratoryDashboardService:
    """Aggregates metrics for Laboratory Quality Dashboard."""

    @staticmethod
    def get_dashboard_metrics(
        db: Session,
        organization_id: Optional[uuid.UUID] = None,
    ) -> Dict[str, Any]:
        """Calculates total samples, pending samples, passed, warning, high risk, hold batches, and average score."""
        batch_query = db.query(BiocharBatch)
        sample_query = db.query(BiocharSample)

        batches = batch_query.all()
        samples = sample_query.all()

        total_samples = len(samples)
        pending_samples = len([s for s in samples if s.laboratory_status == "Pending" or s.validation_status == "Pending"])

        passed_batches = len([b for b in batches if b.validation_status == "Pass"])
        warning_batches = len([b for b in batches if b.validation_status == "Warning"])
        high_risk_batches = len([b for b in batches if b.validation_status == "High Risk"])
        hold_batches = len([b for b in batches if b.validation_status == "Hold Batch"])

        scores = [b.validation_score for b in batches if b.validation_score is not None]
        avg_score = round(sum(scores) / len(scores), 1) if scores else 0.0

        return {
            "status": "success",
            "total_samples": total_samples,
            "pending_samples": pending_samples,
            "passed_batches": passed_batches,
            "warning_batches": warning_batches,
            "high_risk_batches": high_risk_batches,
            "hold_batches": hold_batches,
            "average_validation_score": avg_score,
        }
