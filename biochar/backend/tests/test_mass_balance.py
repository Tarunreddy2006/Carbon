"""
biochar/backend/tests/test_mass_balance.py
──────────────────────────────────────────────────────────────────────────────
Unit tests for MassBalanceService and AnomalyEngine in Stomata Biochar Platform.
──────────────────────────────────────────────────────────────────────────────
"""

import unittest
import uuid
from unittest.mock import MagicMock
from biochar.backend.mass_balance import MassBalanceService, AnomalyResult, DEFAULT_MIN_YIELD_PERCENT, DEFAULT_MAX_YIELD_PERCENT, DEFAULT_MAX_MOISTURE_PERCENT
from biochar.backend.models import FeedstockBatch, BiocharBatch, PyrolysisRun, MassBalanceConfig


class TestMassBalanceService(unittest.TestCase):

    def test_calculate_dry_matter_valid(self):
        # 1000 kg wet biomass at 20% moisture -> Dry = 800 kg, Water = 200 kg
        dry, water = MassBalanceService.calculate_dry_matter(1000.0, 20.0)
        self.assertEqual(dry, 800.0)
        self.assertEqual(water, 200.0)

    def test_calculate_dry_matter_zero_moisture(self):
        dry, water = MassBalanceService.calculate_dry_matter(500.0, 0.0)
        self.assertEqual(dry, 500.0)
        self.assertEqual(water, 0.0)

    def test_calculate_dry_matter_invalid_inputs(self):
        with self.assertRaises(ValueError):
            MassBalanceService.calculate_dry_matter(None, 20.0)

        with self.assertRaises(ValueError):
            MassBalanceService.calculate_dry_matter(-100.0, 20.0)

        with self.assertRaises(ValueError):
            MassBalanceService.calculate_dry_matter(100.0, 150.0)

    def test_calculate_production_yield_valid(self):
        # 250 kg biochar produced from 800 kg dry biomass -> (250 / 800) * 100 = 31.25%
        yield_pct = MassBalanceService.calculate_production_yield(250.0, 800.0)
        self.assertEqual(yield_pct, 31.25)

    def test_calculate_production_yield_invalid_dry_weight(self):
        with self.assertRaises(ValueError):
            MassBalanceService.calculate_production_yield(200.0, 0.0)

    def test_evaluate_feedstock_normal(self):
        db = MagicMock()
        db.query().filter().first.return_value = None

        feedstock = FeedstockBatch(
            id=uuid.uuid4(),
            project_id=uuid.uuid4(),
            batch_code="FS-TEST-001",
            feedstock_type="rice_husk",
            wet_weight_kg=1000.0,
            moisture_percent=15.0,
        )

        anomalies = MassBalanceService.evaluate_feedstock(db, feedstock)
        self.assertEqual(len(anomalies), 0)
        self.assertEqual(feedstock.dry_weight_kg, 850.0)
        self.assertEqual(feedstock.water_weight_kg, 150.0)

    def test_evaluate_feedstock_high_moisture_anomaly(self):
        db = MagicMock()
        db.query().filter().first.return_value = None

        feedstock = FeedstockBatch(
            id=uuid.uuid4(),
            project_id=uuid.uuid4(),
            batch_code="FS-TEST-HIGH-MOISTURE",
            feedstock_type="wood_residue",
            wet_weight_kg=1000.0,
            moisture_percent=75.0,  # Exceeds max 65% moisture threshold
        )

        anomalies = MassBalanceService.evaluate_feedstock(db, feedstock)
        self.assertEqual(len(anomalies), 1)
        self.assertEqual(anomalies[0].rule_id, "RULE_EXCESSIVE_MOISTURE")
        self.assertEqual(anomalies[0].severity, "High")

    def test_evaluate_biochar_batch_low_yield_anomaly(self):
        db = MagicMock()
        db.query().filter().first.return_value = None

        pyrolysis_run = PyrolysisRun(
            id=uuid.uuid4(),
            feedstock_batch=FeedstockBatch(
                id=uuid.uuid4(),
                dry_weight_kg=1000.0,
                expected_yield_percent=30.0,
            )
        )

        batch = BiocharBatch(
            id=uuid.uuid4(),
            pyrolysis_run=pyrolysis_run,
            batch_code="BC-TEST-LOW-YIELD",
            produced_weight_kg=100.0,  # 100 kg / 1000 kg dry = 10% yield (< min 15%)
        )

        anomalies = MassBalanceService.evaluate_biochar_batch(db, batch)
        self.assertEqual(len(anomalies), 1)
        self.assertEqual(anomalies[0].rule_id, "RULE_YIELD_BELOW_MINIMUM")
        self.assertEqual(batch.anomaly_status, "Flagged")
        self.assertEqual(batch.mass_balance_status, "Anomaly")

    def test_evaluate_biochar_batch_high_yield_anomaly(self):
        db = MagicMock()
        db.query().filter().first.return_value = None

        pyrolysis_run = PyrolysisRun(
            id=uuid.uuid4(),
            feedstock_batch=FeedstockBatch(
                id=uuid.uuid4(),
                dry_weight_kg=1000.0,
                expected_yield_percent=30.0,
            )
        )

        batch = BiocharBatch(
            id=uuid.uuid4(),
            pyrolysis_run=pyrolysis_run,
            batch_code="BC-TEST-HIGH-YIELD",
            produced_weight_kg=600.0,  # 600 kg / 1000 kg dry = 60% yield (> max 50%)
        )

        anomalies = MassBalanceService.evaluate_biochar_batch(db, batch)
        self.assertEqual(len(anomalies), 1)
        self.assertEqual(anomalies[0].rule_id, "RULE_YIELD_ABOVE_MAXIMUM")
        self.assertEqual(anomalies[0].severity, "Critical")
        self.assertEqual(batch.anomaly_status, "Flagged")


if __name__ == "__main__":
    unittest.main()
