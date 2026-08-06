"""
biochar/backend/tests/test_chain_of_custody.py
──────────────────────────────────────────────────────────────────────────────
Unit tests for ChainOfCustodyService, MaterialTraceabilityService,
CustodyValidationService, and BatchPassportService (Phase 4).
──────────────────────────────────────────────────────────────────────────────
"""

import unittest
import uuid
from unittest.mock import MagicMock
from biochar.backend.chain_of_custody import (
    ChainOfCustodyService,
    MaterialTraceabilityService,
    CustodyValidationService,
    MaterialTimelineService,
    BatchPassportService,
    ChainDashboardService,
)
from biochar.backend.models import (
    ChainOfCustodyEvent,
    BiocharBatch,
    PyrolysisRun,
    FeedstockBatch,
    BiocharSample,
    Evidence,
)


class TestChainOfCustodyEngine(unittest.TestCase):

    def test_record_custody_event(self):
        db = MagicMock()
        parent_id = uuid.uuid4()
        child_id = uuid.uuid4()

        event = ChainOfCustodyService.record_event(
            db=db,
            event_type="BIOCHAR_BATCH_PRODUCED",
            parent_entity_type="pyrolysis_run",
            parent_entity_id=parent_id,
            child_entity_type="biochar_batch",
            child_entity_id=child_id,
            quantity=1200.0,
            quantity_unit="kg",
            notes="Batch production recorded successfully.",
        )

        self.assertEqual(event.event_type, "BIOCHAR_BATCH_PRODUCED")
        self.assertEqual(event.parent_entity_id, parent_id)
        self.assertEqual(event.child_entity_id, child_id)
        self.assertEqual(event.quantity, 1200.0)
        self.assertEqual(event.status, "Verified")
        db.add.assert_called()
        db.commit.assert_called()

    def test_trace_upstream(self):
        db = MagicMock()
        batch_id = uuid.uuid4()

        project = MagicMock()
        project.id = uuid.uuid4()
        project.name = "Stomata Biochar Project"
        project.district = "District A"
        project.state = "State B"

        feedstock = FeedstockBatch(
            id=uuid.uuid4(),
            batch_code="FS-8819",
            feedstock_lot_number="LOT-8819",
            supplier_name="Green Biomass Pvt Ltd",
            biomass_species="Oryza sativa",
            moisture_percent=14.5,
            dry_weight_kg=855.0,
            origin_location="12.9716, 77.5946",
            project=project,
        )
        run = PyrolysisRun(
            id=uuid.uuid4(),
            run_number="RUN-101",
            reactor_name="Kiln A",
            operator_name="Operator 1",
            feedstock_batch=feedstock,
        )
        batch = BiocharBatch(
            id=batch_id,
            batch_code="BC-2026-001",
            pyrolysis_run=run,
        )

        db.query().filter().first.return_value = batch

        upstream = MaterialTraceabilityService.trace_upstream(db, "biochar_batch", batch_id)

        self.assertIsNotNone(upstream["feedstock_batch"])
        self.assertEqual(upstream["feedstock_batch"]["supplier_name"], "Green Biomass Pvt Ltd")
        self.assertEqual(upstream["pyrolysis_run"]["reactor_name"], "Kiln A")
        self.assertEqual(upstream["project_site"]["name"], "Stomata Biochar Project")

    def test_custody_validation_verified(self):
        db = MagicMock()
        batch_id = uuid.uuid4()

        feedstock = FeedstockBatch(id=uuid.uuid4(), dry_weight_kg=1000.0)
        run = PyrolysisRun(id=uuid.uuid4(), feedstock_batch=feedstock)
        batch = BiocharBatch(
            id=batch_id,
            batch_code="BC-2026-VERIFIED",
            produced_weight_kg=320.0,
            pyrolysis_run=run,
            samples=[BiocharSample(id=uuid.uuid4(), sample_code="SMP-100")],
        )

        db.query().filter().first.return_value = batch
        db.query().filter().count.return_value = 3  # Evidence count > 0

        validation = CustodyValidationService.validate_chain(db, "biochar_batch", batch_id)

        self.assertEqual(validation["status"], "Verified")
        self.assertEqual(validation["verification_badge"], "VERIFIED IMMUTABLE CUSTODY")
        self.assertEqual(len(validation["issues"]), 0)

    def test_custody_validation_missing_feedstock_broken(self):
        db = MagicMock()
        batch_id = uuid.uuid4()

        batch = BiocharBatch(
            id=batch_id,
            batch_code="BC-BROKEN",
            produced_weight_kg=400.0,
            pyrolysis_run=None,  # Missing feedstock/run
        )

        db.query().filter().first.return_value = batch
        db.query().filter().count.return_value = 0

        validation = CustodyValidationService.validate_chain(db, "biochar_batch", batch_id)

        self.assertEqual(validation["status"], "Broken")
        self.assertGreater(validation["total_issues"], 0)
        issue_codes = {i["code"] for i in validation["issues"]}
        self.assertIn("MISSING_FEEDSTOCK", issue_codes)

    def test_dashboard_metrics(self):
        db = MagicMock()
        b1 = BiocharBatch(id=uuid.uuid4(), status="completed", validation_status="Pass", produced_weight_kg=1500.0)
        b2 = BiocharBatch(id=uuid.uuid4(), status="In Storage", validation_status="Hold Batch", mass_balance_status="Anomaly", produced_weight_kg=800.0)

        db.query().all.side_effect = [
            [b1, b2],  # batches
            [ChainOfCustodyEvent(id=uuid.uuid4())],  # events
        ]
        db.query().filter().count.return_value = 2

        metrics = ChainDashboardService.get_dashboard_metrics(db)

        self.assertEqual(metrics["total_active_chains"], 2)
        self.assertEqual(metrics["completed_chains"], 1)
        self.assertEqual(metrics["broken_chains"], 1)
        self.assertEqual(metrics["total_material_flow_tons"], 2.3)


if __name__ == "__main__":
    unittest.main()
