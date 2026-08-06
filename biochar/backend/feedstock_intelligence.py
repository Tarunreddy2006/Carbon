"""
biochar/backend/feedstock_intelligence.py
──────────────────────────────────────────────────────────────────────────────
Feedstock Intelligence Engine for Stomata Biochar Platform (Phase 3).
Rule-based intelligence & decision support system evaluating biomass quality,
moisture trends, storage degradation, supplier performance, and reliability.
──────────────────────────────────────────────────────────────────────────────
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple, Any
import uuid
from sqlalchemy.orm import Session

from biochar.backend.models import (
    FeedstockBatch,
    FeedstockSupplier,
    PyrolysisRun,
    BiocharBatch,
    Evidence,
    FeedstockIntelligenceConfig,
    FeedstockIntelligenceLog,
    EvidenceAuditLog,
)

logger = logging.getLogger("biochar_feedstock_intelligence")

# Default Threshold Constants
DEFAULT_MAX_MOISTURE_PCT = 25.0      # %
DEFAULT_MAX_STORAGE_DAYS = 60        # days
DEFAULT_MIN_SUPPLIER_SCORE = 70.0    # %


class FeedstockRuleResult:
    def __init__(
        self,
        rule_id: str,
        category: str,
        severity: str,  # 'Optimal', 'Acceptable', 'Warning', 'High Risk', 'Rejected'
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


class FeedstockQualityScoreService:
    """Calculates multi-factor Feedstock Quality Score (0-100%)."""

    @staticmethod
    def calculate_lot_score(
        moisture_percent: Optional[float],
        contamination_status: bool,
        storage_days: int,
        dry_weight_ratio: float = 0.8,
    ) -> Tuple[float, Dict[str, float]]:
        """
        Calculates Quality Score (0-100%):
        1. Moisture Score (35%): Moisture <=15% -> 35, 15-25% -> 25, >25% -> 10
        2. Contamination Score (35%): Clean -> 35, Contaminated -> 0
        3. Storage Duration Score (15%): <=30 days -> 15, 30-60 days -> 10, >60 days -> 5
        4. Dry Matter Potential Score (15%): dry_weight_ratio * 15
        """
        # 1. Moisture Score
        m_pct = moisture_percent if moisture_percent is not None else 18.0
        if m_pct <= 15.0:
            moisture_score = 35.0
        elif m_pct <= 25.0:
            moisture_score = 25.0
        else:
            moisture_score = 10.0

        # 2. Contamination Score
        contam_score = 0.0 if contamination_status else 35.0

        # 3. Storage Score
        if storage_days <= 30:
            storage_score = 15.0
        elif storage_days <= 60:
            storage_score = 10.0
        else:
            storage_score = 5.0

        # 4. Dry Matter Score
        dry_matter_score = round(min(dry_weight_ratio, 1.0) * 15.0, 1)

        overall_score = round(moisture_score + contam_score + storage_score + dry_matter_score, 1)

        breakdown = {
            "moisture_score": moisture_score,
            "contamination_score": contam_score,
            "storage_duration_score": storage_score,
            "dry_matter_potential_score": dry_matter_score,
            "overall_quality_score": overall_score,
        }

        return overall_score, breakdown


class FeedstockRuleEngine:
    """Executes rule-based checks on Feedstock Batches."""

    @classmethod
    def evaluate(
        cls,
        batch: FeedstockBatch,
        config: FeedstockIntelligenceConfig,
        supplier_score: Optional[float] = None,
    ) -> Tuple[List[FeedstockRuleResult], str, float, Dict[str, float]]:
        rules: List[FeedstockRuleResult] = []

        m_pct = batch.moisture_percent
        storage_days = batch.storage_days or 0
        contam = batch.contamination_status

        # 1. High Moisture Rule
        if m_pct is not None and m_pct > config.max_moisture_percent:
            rules.append(
                FeedstockRuleResult(
                    rule_id="RULE_HIGH_MOISTURE",
                    category="Moisture Intelligence",
                    severity="Warning",
                    explanation=f"Moisture content ({m_pct:.1f}%) exceeds threshold limit ({config.max_moisture_percent:.1f}%).",
                    recommendation="Pre-dry feedstock before kiln intake to avoid energy loss and lower biochar yield.",
                )
            )

        # 2. Long Storage Rule
        if storage_days > config.max_storage_days:
            rules.append(
                FeedstockRuleResult(
                    rule_id="RULE_EXTENDED_STORAGE",
                    category="Storage Intelligence",
                    severity="Warning",
                    explanation=f"Storage duration ({storage_days} days) exceeds maximum threshold ({config.max_storage_days} days).",
                    recommendation="Prioritize processing older biomass lots to prevent volatile organic degradation.",
                )
            )

        # 3. Contamination Rule
        if contam:
            rules.append(
                FeedstockRuleResult(
                    rule_id="RULE_CONTAMINATION_DETECTED",
                    category="Contamination Alert",
                    severity="High Risk",
                    explanation=f"Biomass lot is flagged for foreign material contamination: {batch.contamination_notes or 'Visual contamination'}.",
                    recommendation="Perform physical screening & manual inspection before feeding biomass into reactor.",
                )
            )

        # 4. Poor Supplier Rule
        if supplier_score is not None and supplier_score < config.min_supplier_score:
            rules.append(
                FeedstockRuleResult(
                    rule_id="RULE_POOR_SUPPLIER",
                    category="Supplier Reliability",
                    severity="Warning",
                    explanation=f"Supplier overall quality score ({supplier_score:.1f}%) is below minimum standard ({config.min_supplier_score:.1f}%).",
                    recommendation="Review supplier procurement contract and request certified biomass moisture reports.",
                )
            )

        # Dry matter ratio
        dry_ratio = (batch.dry_weight_kg / batch.wet_weight_kg) if (batch.dry_weight_kg and batch.wet_weight_kg and batch.wet_weight_kg > 0) else 0.82

        score, breakdown = FeedstockQualityScoreService.calculate_lot_score(
            moisture_percent=m_pct,
            contamination_status=contam,
            storage_days=storage_days,
            dry_weight_ratio=dry_ratio,
        )

        # Determine quality status based on severities and score
        severities = {r.severity for r in rules}
        if "High Risk" in severities or contam:
            quality_status = "High Risk"
        elif "Warning" in severities or score < 75.0:
            quality_status = "Warning"
        elif score < 90.0:
            quality_status = "Acceptable"
        else:
            quality_status = "Optimal"


        return rules, quality_status, score, breakdown


class SupplierAnalyticsService:
    """Calculates supplier delivery metrics and reliability ratings."""

    @staticmethod
    def get_supplier_analytics(
        db: Session,
        organization_id: Optional[uuid.UUID] = None,
    ) -> List[Dict[str, Any]]:
        """Calculates deliveries count, avg moisture, avg dry matter, avg yield, quality score, and reliability rating per supplier."""
        batches = db.query(FeedstockBatch).all()

        supplier_map: Dict[str, List[FeedstockBatch]] = {}
        for b in batches:
            s_name = b.supplier_name or "Unknown Supplier"
            if s_name not in supplier_map:
                supplier_map[s_name] = []
            supplier_map[s_name].append(b)

        suppliers_analytics = []
        for s_name, s_batches in supplier_map.items():
            total = len(s_batches)
            moistures = [b.moisture_percent for b in s_batches if b.moisture_percent is not None]
            avg_moisture = round(sum(moistures) / len(moistures), 1) if moistures else 0.0

            dry_ratios = [
                (b.dry_weight_kg / b.wet_weight_kg * 100)
                for b in s_batches
                if b.dry_weight_kg and b.wet_weight_kg and b.wet_weight_kg > 0
            ]
            avg_dry_matter = round(sum(dry_ratios) / len(dry_ratios), 1) if dry_ratios else (100.0 - avg_moisture)

            yields = [b.expected_yield_percent for b in s_batches if b.expected_yield_percent is not None]
            avg_yield = round(sum(yields) / len(yields), 1) if yields else 30.0

            rejected = len([b for b in s_batches if b.contamination_status or (b.quality_status == 'Rejected')])
            accepted = total - rejected

            scores = [b.quality_score for b in s_batches if b.quality_score is not None]
            overall_score = round(sum(scores) / len(scores), 1) if scores else 90.0

            if overall_score >= 90.0:
                reliability = "Excellent"
            elif overall_score >= 75.0:
                reliability = "Good"
            elif overall_score >= 60.0:
                reliability = "Fair"
            else:
                reliability = "Poor"

            suppliers_analytics.append({
                "supplier_name": s_name,
                "total_deliveries": total,
                "accepted_deliveries": accepted,
                "rejected_deliveries": rejected,
                "average_moisture_percent": avg_moisture,
                "average_dry_matter_percent": avg_dry_matter,
                "average_yield_percent": avg_yield,
                "quality_score": overall_score,
                "reliability_rating": reliability,
            })

        # Sort by quality score descending
        suppliers_analytics.sort(key=lambda x: x["quality_score"], reverse=True)
        return suppliers_analytics


class FeedstockRecommendationService:
    """Generates automated rule-based decision support recommendations."""

    @staticmethod
    def generate_recommendations(
        db: Session,
        organization_id: Optional[uuid.UUID] = None,
    ) -> List[Dict[str, Any]]:
        recs = []
        batches = db.query(FeedstockBatch).all()
        suppliers = SupplierAnalyticsService.get_supplier_analytics(db, organization_id)

        # 1. Top Supplier Recommendation
        if suppliers and suppliers[0]["quality_score"] >= 88.0:
            top_s = suppliers[0]
            recs.append({
                "category": "Supplier Optimization",
                "title": f"Prioritize Biomass Procurement from {top_s['supplier_name']}",
                "description": f"{top_s['supplier_name']} consistently delivers higher quality biomass ({top_s['quality_score']}% quality score, {top_s['average_moisture_percent']}% moisture).",
                "impact": "High Efficiency",
                "timestamp": datetime.now(timezone.utc).isoformat(),
            })

        # 2. Moisture Trend Insight
        if batches:
            recent = sorted(batches, key=lambda x: x.created_at, reverse=True)[:5]
            rec_moistures = [b.moisture_percent for b in recent if b.moisture_percent is not None]
            if rec_moistures:
                avg_rec_m = sum(rec_moistures) / len(rec_moistures)
                if avg_rec_m > 22.0:
                    recs.append({
                        "category": "Moisture Control",
                        "title": "Moisture Increase Detected in Recent Deliveries",
                        "description": f"Average moisture level reached {avg_rec_m:.1f}% across recent deliveries. Recommend pre-drying covered storage.",
                        "impact": "Medium Impact",
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                    })

        # 3. Storage Location Insight
        long_stored = [b for b in batches if (b.storage_days or 0) > 45]
        if long_stored:
            locations = {b.storage_location or 'Main Yard' for b in long_stored}
            loc_str = ", ".join(locations)
            recs.append({
                "category": "Inventory Management",
                "title": f"Extended Storage Duration in {loc_str}",
                "description": f"{len(long_stored)} biomass lots have exceeded 45 days in storage. Process these lots first to prevent volatile carbon loss.",
                "impact": "Quality Protection",
                "timestamp": datetime.now(timezone.utc).isoformat(),
            })

        return recs


class FeedstockIntelligenceService:
    """Core orchestration service for Feedstock Intelligence Engine."""

    @staticmethod
    def get_config(db: Session, organization_id: Optional[uuid.UUID] = None) -> FeedstockIntelligenceConfig:
        if organization_id:
            cfg = db.query(FeedstockIntelligenceConfig).filter(
                FeedstockIntelligenceConfig.organization_id == organization_id
            ).first()
            if cfg:
                return cfg

        return FeedstockIntelligenceConfig(
            organization_id=organization_id,
            max_moisture_percent=DEFAULT_MAX_MOISTURE_PCT,
            max_storage_days=DEFAULT_MAX_STORAGE_DAYS,
            min_supplier_score=DEFAULT_MIN_SUPPLIER_SCORE,
            contamination_strict=True,
            quality_weights={"moisture": 35, "contamination": 35, "storage": 15, "dry_matter": 15},
        )

    @classmethod
    def evaluate_feedstock(
        cls,
        db: Session,
        feedstock_id: uuid.UUID,
        organization_id: Optional[uuid.UUID] = None,
        user_id: Optional[uuid.UUID] = None,
    ) -> Dict[str, Any]:
        batch = db.query(FeedstockBatch).filter(FeedstockBatch.id == feedstock_id).first()
        if not batch:
            raise ValueError(f"FeedstockBatch with ID {feedstock_id} not found.")

        config = cls.get_config(db, organization_id)
        rules, quality_status, score, breakdown = FeedstockRuleEngine.evaluate(batch, config)

        # Update DB fields
        batch.quality_status = quality_status
        batch.quality_score = score
        if not batch.feedstock_lot_number:
            batch.feedstock_lot_number = f"LOT-{batch.batch_code}"

        # Write log
        intel_log = FeedstockIntelligenceLog(
            organization_id=organization_id,
            project_id=batch.project_id,
            feedstock_id=batch.id,
            rule_triggered=";".join([r.rule_id for r in rules]) if rules else "ALL_RULES_PASSED",
            quality_score=score,
            quality_status=quality_status,
            recommendation=rules[0].recommendation if rules else "Optimal feedstock parameters.",
            details={"rules": [r.to_dict() for r in rules], "breakdown": breakdown},
            evaluated_by=user_id,
            created_at=datetime.now(timezone.utc),
        )
        db.add(intel_log)

        # Audit log
        audit_entry = EvidenceAuditLog(
            user_id=user_id,
            action="FEEDSTOCK_INTELLIGENCE_EVALUATION",
            details={
                "feedstock_id": str(batch.id),
                "lot_number": batch.feedstock_lot_number,
                "quality_status": quality_status,
                "quality_score": score,
            },
            created_at=datetime.now(timezone.utc),
        )
        db.add(audit_entry)

        db.commit()

        return {
            "status": "success",
            "feedstock_id": str(batch.id),
            "lot_number": batch.feedstock_lot_number,
            "quality_status": quality_status,
            "quality_score": score,
            "score_breakdown": breakdown,
            "rules": [r.to_dict() for r in rules],
        }


class FeedstockDashboardService:
    """Aggregates metrics and trends for Feedstock Intelligence Dashboard."""

    @staticmethod
    def get_dashboard_metrics(
        db: Session,
        organization_id: Optional[uuid.UUID] = None,
    ) -> Dict[str, Any]:
        batches = db.query(FeedstockBatch).all()

        total_lots = len(batches)
        moistures = [b.moisture_percent for b in batches if b.moisture_percent is not None]
        avg_moisture = round(sum(moistures) / len(moistures), 1) if moistures else 0.0

        dry_ratios = [
            (b.dry_weight_kg / b.wet_weight_kg * 100)
            for b in batches
            if b.dry_weight_kg and b.wet_weight_kg and b.wet_weight_kg > 0
        ]
        avg_dry_matter = round(sum(dry_ratios) / len(dry_ratios), 1) if dry_ratios else (100.0 - avg_moisture)

        scores = [b.quality_score for b in batches if b.quality_score is not None]
        avg_quality = round(sum(scores) / len(scores), 1) if scores else 92.0

        suppliers = SupplierAnalyticsService.get_supplier_analytics(db, organization_id)
        top_supplier = suppliers[0]["supplier_name"] if suppliers else "—"

        alerts = [b for b in batches if b.contamination_status or (b.quality_status in ('Warning', 'High Risk'))]
        active_alerts_count = len(alerts)

        return {
            "status": "success",
            "total_feedstock_lots": total_lots,
            "average_moisture_percent": avg_moisture,
            "average_dry_matter_percent": avg_dry_matter,
            "average_quality_score": avg_quality,
            "top_supplier": top_supplier,
            "active_alerts_count": active_alerts_count,
        }

    @staticmethod
    def get_trends(db: Session) -> Dict[str, Any]:
        batches = db.query(FeedstockBatch).order_by(FeedstockBatch.created_at).all()

        timeline = []
        species_yield: Dict[str, List[float]] = {}
        supplier_yield: Dict[str, List[float]] = {}

        for b in batches:
            date_str = b.created_at.strftime("%Y-%m-%d") if b.created_at else "2026-08-01"
            m = b.moisture_percent or 18.0
            d = (b.dry_weight_kg / b.wet_weight_kg * 100) if (b.dry_weight_kg and b.wet_weight_kg and b.wet_weight_kg > 0) else 82.0
            y = b.expected_yield_percent or 30.0

            timeline.append({
                "date": date_str,
                "moisture_percent": m,
                "dry_matter_percent": d,
                "yield_percent": y,
            })

            sp = b.biomass_species or b.feedstock_type or "Rice Husk"
            if sp not in species_yield:
                species_yield[sp] = []
            species_yield[sp].append(y)

            sup = b.supplier_name or "General Biomass"
            if sup not in supplier_yield:
                supplier_yield[sup] = []
            supplier_yield[sup].append(y)

        yield_by_species = {k: round(sum(v)/len(v), 1) for k, v in species_yield.items()}
        yield_by_supplier = {k: round(sum(v)/len(v), 1) for k, v in supplier_yield.items()}

        return {
            "status": "success",
            "timeline": timeline,
            "yield_by_species": yield_by_species,
            "yield_by_supplier": yield_by_supplier,
        }
