"""
biochar/backend/tests/test_lab_validation.py
──────────────────────────────────────────────────────────────────────────────
Unit tests for LaboratoryValidationService, ValidationRuleEngine, and
ValidationScoreService in Stomata Biochar Platform (Phase 2).
──────────────────────────────────────────────────────────────────────────────
"""

import unittest
import uuid
from unittest.mock import MagicMock
from biochar.backend.lab_validation import (
    LaboratoryValidationService,
    ValidationRuleEngine,
    ValidationScoreService,
    LaboratoryDashboardService,
    LaboratoryValidationConfig,
    ValidationRuleResult,
    DEFAULT_MIN_PEAK_TEMP,
    DEFAULT_MIN_RESIDENCE_TIME,
    DEFAULT_MAX_MOISTURE_PCT,
)
from biochar.backend.models import BiocharBatch, BiocharSample, PyrolysisRun, FeedstockBatch, Evidence


class TestLaboratoryValidationEngine(unittest.TestCase):

    def test_score_service_perfect(self):
        score, breakdown = ValidationScoreService.calculate_score(
            has_production_params=True,
            temp_ok=True,
            residence_ok=True,
            has_sample=True,
            evidence_count=3,
            required_evidence_count=3,
            mass_balance_pass=True,
        )
        self.assertEqual(score, 100.0)
        self.assertEqual(breakdown["production_parameters_score"], 25.0)
        self.assertEqual(breakdown["laboratory_sample_score"], 25.0)
        self.assertEqual(breakdown["evidence_score"], 25.0)
        self.assertEqual(breakdown["mass_balance_score"], 25.0)

    def test_score_service_partial(self):
        score, breakdown = ValidationScoreService.calculate_score(
            has_production_params=True,
            temp_ok=False,  # -7.5
            residence_ok=True,
            has_sample=False,  # -25.0
            evidence_count=2,
            required_evidence_count=3,  # 2/3 * 25 = 16.7
            mass_balance_pass=True,  # 25.0
        )
        self.assertLess(score, 100.0)
        self.assertEqual(breakdown["laboratory_sample_score"], 0.0)

    def test_rule_engine_normal_pass(self):
        db = MagicMock()
        config = LaboratoryValidationConfig(
            min_peak_temperature=450.0,
            min_residence_time_minutes=30,
            max_moisture_percent=65.0,
            required_evidence_types=["feedstock", "pyrolysis", "batch"],
        )

        feedstock = FeedstockBatch(
            id=uuid.uuid4(),
            project_id=uuid.uuid4(),
            moisture_percent=18.0,
        )
        run = PyrolysisRun(
            id=uuid.uuid4(),
            feedstock_batch=feedstock,
            maximum_temperature=480.0,
            residence_time_minutes=40,
        )
        batch = BiocharBatch(
            id=uuid.uuid4(),
            batch_code="BC-TEST-PASS",
            pyrolysis_run=run,
            peak_temperature=480.0,
            residence_time_minutes=40,
            produced_weight_kg=500.0,
            samples=[BiocharSample(id=uuid.uuid4(), sample_code="SMP-001")],
        )

        db.query().filter().all.return_value = [Evidence(id=uuid.uuid4()), Evidence(id=uuid.uuid4()), Evidence(id=uuid.uuid4())]

        rules, status, risk, ready = ValidationRuleEngine.evaluate(db, batch, config)
        self.assertEqual(status, "Pass")
        self.assertEqual(risk, "Low")
        self.assertTrue(ready)
        self.assertEqual(len(rules), 0)

    def test_rule_engine_temperature_and_moisture_warnings(self):
        db = MagicMock()
        config = LaboratoryValidationConfig(
            min_peak_temperature=450.0,
            min_residence_time_minutes=30,
            max_moisture_percent=65.0,
            required_evidence_types=["feedstock"],
        )

        feedstock = FeedstockBatch(
            id=uuid.uuid4(),
            project_id=uuid.uuid4(),
            moisture_percent=72.0,  # Warning: > 65%
        )
        run = PyrolysisRun(
            id=uuid.uuid4(),
            feedstock_batch=feedstock,
        )
        batch = BiocharBatch(
            id=uuid.uuid4(),
            batch_code="BC-TEST-WARN",
            pyrolysis_run=run,
            peak_temperature=410.0,  # Warning: < 450°C
            residence_time_minutes=35,
            produced_weight_kg=500.0,
            samples=[BiocharSample(id=uuid.uuid4(), sample_code="SMP-002")],
        )

        db.query().filter().all.return_value = [Evidence(id=uuid.uuid4())]

        rules, status, risk, ready = ValidationRuleEngine.evaluate(db, batch, config)
        self.assertEqual(status, "Warning")
        self.assertEqual(risk, "Medium")
        self.assertTrue(ready)

        rule_ids = {r.rule_id for r in rules}
        self.assertIn("RULE_TEMP_LOW", rule_ids)
        self.assertIn("RULE_MOISTURE_EXCESSIVE", rule_ids)

    def test_rule_engine_missing_sample_high_risk(self):
        db = MagicMock()
        config = LaboratoryValidationConfig(
            min_peak_temperature=450.0,
            min_residence_time_minutes=30,
            max_moisture_percent=65.0,
            required_evidence_types=["feedstock"],
        )

        batch = BiocharBatch(
            id=uuid.uuid4(),
            batch_code="BC-TEST-NO-SAMPLE",
            pyrolysis_run=None,
            peak_temperature=500.0,
            residence_time_minutes=45,
            produced_weight_kg=300.0,
            samples=[],  # Missing sample
        )

        db.query().filter().all.return_value = [Evidence(id=uuid.uuid4())]

        rules, status, risk, ready = ValidationRuleEngine.evaluate(db, batch, config)
        self.assertEqual(status, "High Risk")
        self.assertEqual(risk, "High")
        self.assertFalse(ready)

        rule_ids = {r.rule_id for r in rules}
        self.assertIn("RULE_MISSING_SAMPLE", rule_ids)

    def test_dashboard_metrics(self):
        db = MagicMock()
        batch_1 = BiocharBatch(id=uuid.uuid4(), validation_status="Pass", validation_score=95.0)
        batch_2 = BiocharBatch(id=uuid.uuid4(), validation_status="Warning", validation_score=80.0)
        batch_3 = BiocharBatch(id=uuid.uuid4(), validation_status="Hold Batch", validation_score=45.0)

        db.query().all.side_effect = [
            [batch_1, batch_2, batch_3],  # batches
            [BiocharSample(id=uuid.uuid4(), laboratory_status="Pending")],  # samples
        ]

        metrics = LaboratoryDashboardService.get_dashboard_metrics(db)
        self.assertEqual(metrics["passed_batches"], 1)
        self.assertEqual(metrics["warning_batches"], 1)
        self.assertEqual(metrics["hold_batches"], 1)
        self.assertEqual(metrics["average_validation_score"], 73.3)


if __name__ == "__main__":
    unittest.main()
