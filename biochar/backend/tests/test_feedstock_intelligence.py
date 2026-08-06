"""
biochar/backend/tests/test_feedstock_intelligence.py
──────────────────────────────────────────────────────────────────────────────
Unit tests for FeedstockIntelligenceService, FeedstockRuleEngine,
SupplierAnalyticsService, and FeedstockQualityScoreService (Phase 3).
──────────────────────────────────────────────────────────────────────────────
"""

import unittest
import uuid
from unittest.mock import MagicMock
from biochar.backend.feedstock_intelligence import (
    FeedstockIntelligenceService,
    FeedstockRuleEngine,
    FeedstockQualityScoreService,
    SupplierAnalyticsService,
    FeedstockRecommendationService,
    FeedstockDashboardService,
    FeedstockIntelligenceConfig,
    DEFAULT_MAX_MOISTURE_PCT,
    DEFAULT_MAX_STORAGE_DAYS,
)
from biochar.backend.models import FeedstockBatch, FeedstockSupplier


class TestFeedstockIntelligenceEngine(unittest.TestCase):

    def test_quality_score_optimal(self):
        score, breakdown = FeedstockQualityScoreService.calculate_lot_score(
            moisture_percent=12.0,       # 35.0
            contamination_status=False,  # 35.0
            storage_days=15,             # 15.0
            dry_weight_ratio=0.88,       # 13.2
        )
        self.assertEqual(score, 98.2)
        self.assertEqual(breakdown["moisture_score"], 35.0)
        self.assertEqual(breakdown["contamination_score"], 35.0)
        self.assertEqual(breakdown["storage_duration_score"], 15.0)

    def test_quality_score_high_moisture_and_contaminated(self):
        score, breakdown = FeedstockQualityScoreService.calculate_lot_score(
            moisture_percent=28.0,       # 10.0
            contamination_status=True,   # 0.0
            storage_days=75,             # 5.0
            dry_weight_ratio=0.72,       # 10.8
        )
        self.assertEqual(score, 25.8)
        self.assertEqual(breakdown["contamination_score"], 0.0)
        self.assertEqual(breakdown["moisture_score"], 10.0)

    def test_rule_engine_high_moisture_and_storage_warnings(self):
        config = FeedstockIntelligenceConfig(
            max_moisture_percent=25.0,
            max_storage_days=60,
            min_supplier_score=70.0,
        )
        batch = FeedstockBatch(
            id=uuid.uuid4(),
            batch_code="FS-TEST-WARN",
            moisture_percent=29.0,      # > 25.0%
            storage_days=70,            # > 60 days
            contamination_status=False,
            wet_weight_kg=1000.0,
            dry_weight_kg=710.0,
        )

        rules, status, score, breakdown = FeedstockRuleEngine.evaluate(batch, config)
        self.assertEqual(status, "Warning")
        rule_ids = {r.rule_id for r in rules}
        self.assertIn("RULE_HIGH_MOISTURE", rule_ids)
        self.assertIn("RULE_EXTENDED_STORAGE", rule_ids)

    def test_rule_engine_contamination_high_risk(self):
        config = FeedstockIntelligenceConfig(
            max_moisture_percent=25.0,
            max_storage_days=60,
            min_supplier_score=70.0,
        )
        batch = FeedstockBatch(
            id=uuid.uuid4(),
            batch_code="FS-TEST-CONTAM",
            moisture_percent=14.0,
            storage_days=10,
            contamination_status=True,  # High Risk
            contamination_notes="Plastic & stone fragments detected",
            wet_weight_kg=1000.0,
            dry_weight_kg=860.0,
        )

        rules, status, score, breakdown = FeedstockRuleEngine.evaluate(batch, config)
        self.assertEqual(status, "High Risk")
        rule_ids = {r.rule_id for r in rules}
        self.assertIn("RULE_CONTAMINATION_DETECTED", rule_ids)

    def test_supplier_analytics(self):
        db = MagicMock()
        b1 = FeedstockBatch(
            supplier_name="Green Biomass Pvt Ltd",
            wet_weight_kg=1000.0,
            dry_weight_kg=850.0,
            moisture_percent=15.0,
            expected_yield_percent=32.0,
            quality_score=94.0,
            contamination_status=False,
        )
        b2 = FeedstockBatch(
            supplier_name="Green Biomass Pvt Ltd",
            wet_weight_kg=1000.0,
            dry_weight_kg=830.0,
            moisture_percent=17.0,
            expected_yield_percent=30.0,
            quality_score=90.0,
            contamination_status=False,
        )

        db.query().all.return_value = [b1, b2]

        analytics = SupplierAnalyticsService.get_supplier_analytics(db)
        self.assertEqual(len(analytics), 1)
        s = analytics[0]
        self.assertEqual(s["supplier_name"], "Green Biomass Pvt Ltd")
        self.assertEqual(s["total_deliveries"], 2)
        self.assertEqual(s["accepted_deliveries"], 2)
        self.assertEqual(s["average_moisture_percent"], 16.0)
        self.assertEqual(s["reliability_rating"], "Excellent")

    def test_dashboard_metrics(self):
        db = MagicMock()
        b1 = FeedstockBatch(wet_weight_kg=1000.0, dry_weight_kg=850.0, moisture_percent=15.0, quality_score=94.0, contamination_status=False)
        b2 = FeedstockBatch(wet_weight_kg=1000.0, dry_weight_kg=750.0, moisture_percent=25.0, quality_score=80.0, contamination_status=True)

        db.query().all.return_value = [b1, b2]

        metrics = FeedstockDashboardService.get_dashboard_metrics(db)
        self.assertEqual(metrics["total_feedstock_lots"], 2)
        self.assertEqual(metrics["average_moisture_percent"], 20.0)
        self.assertEqual(metrics["active_alerts_count"], 1)


if __name__ == "__main__":
    unittest.main()
