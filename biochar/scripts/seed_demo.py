# -*- coding: utf-8 -*-
"""
carbon/biochar/scripts/seed_demo.py
──────────────────────────────────────────────────────────────────────────────
Demo data seeder for the Biochar Carbon-Removal Module.
Populates multiple test scenarios for verification:
- Scenario A: High-Permanence (1000yr) fully compliant batch
- Scenario B: Thermal Anomaly failure (fails temperature limits)
- Scenario C: Chemical Quality failure (fails H:C ratio limits)
──────────────────────────────────────────────────────────────────────────────
"""

from __future__ import annotations

import sys
import os
import logging
from datetime import datetime, timedelta, timezone

workspace_root = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "..")
)
if workspace_root not in sys.path:
    sys.path.insert(0, workspace_root)

from carbon.biochar.backend.database import SessionLocal, engine
from carbon.biochar.backend.models import (
    BatchStatus,
    BiocharBatch,
    DistributionSink,
    FeedstockIngest,
    FeedstockType,
    LabAssay,
    Project,
    PyrolysisTelemetry,
    VerificationTier,
)
from carbon.biochar.backend.validation import (
    calculate_net_sequestration,
    evaluate_chemical_permanence,
    validate_thermal_stability,
    check_batch_delivery_completion,
)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("demo_seeder")


def clear_existing_data(session):
    """Safely clear existing demo data in reverse dependency order."""
    logger.info("Clearing existing demo data...")
    
    # 1. Fetch demo projects to identify related rows
    demo_projects = session.query(Project).filter(
        Project.name.like("Demo Biochar%")
    ).all()
    project_ids = [p.id for p in demo_projects]
    
    if not project_ids:
        logger.info("No existing demo projects found.")
        return

    # 2. Fetch related batches
    batches = session.query(BiocharBatch).filter(
        BiocharBatch.project_id.in_(project_ids)
    ).all()
    batch_ids = [b.id for b in batches]

    if batch_ids:
        # Delete dependent tables
        session.query(DistributionSink).filter(
            DistributionSink.batch_id.in_(batch_ids)
        ).delete(synchronize_session=False)
        
        session.query(LabAssay).filter(
            LabAssay.batch_id.in_(batch_ids)
        ).delete(synchronize_session=False)
        
        session.query(PyrolysisTelemetry).filter(
            PyrolysisTelemetry.batch_id.in_(batch_ids)
        ).delete(synchronize_session=False)
        
        session.query(FeedstockIngest).filter(
            FeedstockIngest.batch_id.in_(batch_ids)
        ).delete(synchronize_session=False)
        
        session.query(BiocharBatch).filter(
            BiocharBatch.project_id.in_(project_ids)
        ).delete(synchronize_session=False)

    # Delete projects
    session.query(Project).filter(Project.id.in_(project_ids)).delete(
        synchronize_session=False
    )
    
    session.commit()
    logger.info("Demo database clean completed successfully.")


def seed_scenario_a(session, project):
    """
    Scenario A: High-Permanence Blueprint
    Compliant temperatures, low H:C ratio (0.26), fully attested distribution sinks.
    """
    logger.info("Seeding Scenario A: High-Permanence Blueprint...")
    base_time = datetime.now(timezone.utc) - timedelta(days=5)

    # 1. Create Batch
    batch = BiocharBatch(
        project_id=project.id,
        batch_lot_number="LOT-DEMO-SCENARIO-A",
        status=BatchStatus.sourcing_purgatory,
    )
    session.add(batch)
    session.flush()

    # 2. Add Feedstock
    feedstock = FeedstockIngest(
        batch_id=batch.id,
        feedstock_type=FeedstockType.rice_husk,
        source_latitude=12.9716,
        source_longitude=77.5946,
        wet_mass_tons=45.5,
        satellite_clearance_status=True,
        created_at=base_time,
    )
    session.add(feedstock)

    # 3. Add Compliant Telemetry (550C - 620C)
    for i in range(12):  # 12 readings, every 10 mins over 2 hours
        timestamp = base_time + timedelta(minutes=10 * i + 10)
        telemetry = PyrolysisTelemetry(
            batch_id=batch.id,
            timestamp=timestamp,
            kiln_temperature_celsius=580.0 + (i % 3) * 10.0,  # 580, 590, 600
            electricity_consumption_kwh=15.0,
            fossil_fuel_consumption_liters=4.2,
        )
        session.add(telemetry)
    session.flush()

    # Run thermal validation
    logger.info("Evaluating thermal stability for Scenario A...")
    is_thermal_valid = validate_thermal_stability(batch.id, db=session)
    assert is_thermal_valid is True, "Scenario A thermal validation should pass."

    # 4. Add Lab Assay with molar H:C = 0.26 (High Permanence)
    lab_assay = LabAssay(
        batch_id=batch.id,
        organic_carbon_percentage=82.5,
        molar_hc_ratio=0.26,
        verification_tier=VerificationTier.pending,
        certificate_hash="e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        uploaded_at=base_time + timedelta(hours=3),
    )
    session.add(lab_assay)
    session.flush()

    # Run chemical validation
    logger.info("Evaluating chemical permanence for Scenario A...")
    tier = evaluate_chemical_permanence(batch.id, db=session)
    assert tier == VerificationTier.high_permanence_1000yr, "Scenario A should achieve 1000yr tier."

    # Calculate net sequestration
    logger.info("Calculating net sequestration for Scenario A...")
    calculate_net_sequestration(batch.id, db=session)

    # 5. Add 5 Attested Distribution Sinks
    logger.info("Creating attested distribution sinks for Scenario A...")
    locations = [
        (12.9716, 77.5946),  # Bangalore
        (13.0827, 80.2707),  # Chennai
        (17.3850, 78.4867),  # Hyderabad
        (19.0760, 72.8777),  # Mumbai
        (12.2958, 76.6394),  # Mysore
    ]
    for idx, (lat, lon) in enumerate(locations):
        sink = DistributionSink(
            batch_id=batch.id,
            delivery_ticket_id=f"TICKET-DEMO-A-00{idx+1}",
            farmer_id=f"FARMER-A-00{idx+1}",
            shipped_mass_tons=8.0,
            sink_latitude=lat,
            sink_longitude=lon,
            photo_evidence_url=f"https://biochar.stomata.tech/evidence/sinks/demo-proof-a-00{idx+1}.jpg",
            attestation_timestamp=base_time + timedelta(days=1, hours=idx),
        )
        session.add(sink)
    session.flush()

    # Trigger batch completion check
    logger.info("Running completion checks for Scenario A...")
    is_completed = check_batch_delivery_completion(batch.id, db=session)
    assert is_completed is True, "Scenario A batch should be fully completed."
    
    session.commit()
    logger.info("Scenario A seeded successfully.")


def seed_scenario_b(session, project):
    """
    Scenario B: Thermal Anomaly Rejection
    Fails due to drop to 290C for 25 consecutive minutes during telemetry.
    """
    logger.info("Seeding Scenario B: Thermal Anomaly Rejection...")
    base_time = datetime.now(timezone.utc) - timedelta(days=3)

    # 1. Create Batch
    batch = BiocharBatch(
        project_id=project.id,
        batch_lot_number="LOT-DEMO-SCENARIO-B",
        status=BatchStatus.sourcing_purgatory,
    )
    session.add(batch)
    session.flush()

    # 2. Add Feedstock
    feedstock = FeedstockIngest(
        batch_id=batch.id,
        feedstock_type=FeedstockType.coffee_hulls,
        source_latitude=13.0827,
        source_longitude=80.2707,
        wet_mass_tons=38.0,
        satellite_clearance_status=True,
        created_at=base_time,
    )
    session.add(feedstock)

    # 3. Add Telemetry containing the thermal anomaly
    # Phase 1: 520°C for 3 hours (readings every 30 minutes)
    for i in range(6):
        timestamp = base_time + timedelta(minutes=30 * i)
        telemetry = PyrolysisTelemetry(
            batch_id=batch.id,
            timestamp=timestamp,
            kiln_temperature_celsius=520.0,
            electricity_consumption_kwh=10.0,
            fossil_fuel_consumption_liters=3.0,
        )
        session.add(telemetry)

    # Phase 2: Anomaly - 290°C for 25 consecutive minutes (readings every 5 minutes)
    anomaly_start = base_time + timedelta(hours=3)
    for i in range(6):  # 0 to 25 minutes = 6 readings
        timestamp = anomaly_start + timedelta(minutes=5 * i)
        telemetry = PyrolysisTelemetry(
            batch_id=batch.id,
            timestamp=timestamp,
            kiln_temperature_celsius=290.0,
            electricity_consumption_kwh=2.0,
            fossil_fuel_consumption_liters=0.5,
        )
        session.add(telemetry)

    # Phase 3: Recovery afterward (readings every 30 minutes)
    recovery_start = anomaly_start + timedelta(minutes=35)
    for i in range(4):
        timestamp = recovery_start + timedelta(minutes=30 * i)
        telemetry = PyrolysisTelemetry(
            batch_id=batch.id,
            timestamp=timestamp,
            kiln_temperature_celsius=520.0,
            electricity_consumption_kwh=10.0,
            fossil_fuel_consumption_liters=3.0,
        )
        session.add(telemetry)
    session.flush()

    # Run thermal validation
    logger.info("Evaluating thermal stability for Scenario B...")
    is_thermal_valid = validate_thermal_stability(batch.id, db=session)
    assert is_thermal_valid is False, "Scenario B must violate thermal stability."
    
    session.refresh(batch)
    assert batch.status == BatchStatus.ineligible, "Scenario B batch status should be ineligible."

    # 4. Add Lab Assay
    lab_assay = LabAssay(
        batch_id=batch.id,
        organic_carbon_percentage=75.0,
        molar_hc_ratio=0.26,
        verification_tier=VerificationTier.pending,
        certificate_hash="e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b856",
        uploaded_at=base_time + timedelta(hours=6),
    )
    session.add(lab_assay)
    session.flush()

    # Evaluate chemical
    evaluate_chemical_permanence(batch.id, db=session)
    calculate_net_sequestration(batch.id, db=session)

    session.commit()
    logger.info("Scenario B seeded successfully (validation logs captured).")


def seed_scenario_c(session, project):
    """
    Scenario C: Chemical Quality Exclusion
    Compliant temperatures, but fails because H:C ratio is 0.78 (> 0.7 limit).
    """
    logger.info("Seeding Scenario C: Chemical Quality Exclusion...")
    base_time = datetime.now(timezone.utc) - timedelta(days=2)

    # 1. Create Batch
    batch = BiocharBatch(
        project_id=project.id,
        batch_lot_number="LOT-DEMO-SCENARIO-C",
        status=BatchStatus.sourcing_purgatory,
    )
    session.add(batch)
    session.flush()

    # 2. Add Feedstock
    feedstock = FeedstockIngest(
        batch_id=batch.id,
        feedstock_type=FeedstockType.wood_residue,
        source_latitude=17.3850,
        source_longitude=78.4867,
        wet_mass_tons=32.0,
        satellite_clearance_status=True,
        created_at=base_time,
    )
    session.add(feedstock)

    # 3. Add Compliant Telemetry
    for i in range(12):
        timestamp = base_time + timedelta(minutes=10 * i + 10)
        telemetry = PyrolysisTelemetry(
            batch_id=batch.id,
            timestamp=timestamp,
            kiln_temperature_celsius=575.0,
            electricity_consumption_kwh=12.0,
            fossil_fuel_consumption_liters=3.5,
        )
        session.add(telemetry)
    session.flush()

    # Run thermal validation
    validate_thermal_stability(batch.id, db=session)

    # 4. Add Lab Assay with molar H:C = 0.78 (Exceeds limit of 0.7)
    lab_assay = LabAssay(
        batch_id=batch.id,
        organic_carbon_percentage=65.0,
        molar_hc_ratio=0.78,
        verification_tier=VerificationTier.pending,
        certificate_hash="e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b857",
        uploaded_at=base_time + timedelta(hours=4),
    )
    session.add(lab_assay)
    session.flush()

    # Run chemical validation
    logger.info("Evaluating chemical permanence for Scenario C...")
    tier = evaluate_chemical_permanence(batch.id, db=session)
    assert tier == "ineligible", "Scenario C should fail chemical limit check."

    session.refresh(batch)
    assert batch.status == BatchStatus.ineligible, "Scenario C batch status should be ineligible."

    calculate_net_sequestration(batch.id, db=session)
    session.commit()
    logger.info("Scenario C seeded successfully.")


def main():
    logger.info("Starting demo seeder execution...")
    session = SessionLocal()
    try:
        # Clear existing
        clear_existing_data(session)

        # Create base demo project
        project = Project(
            name="Demo Biochar Carbon Project"
        )
        session.add(project)
        session.commit()
        session.refresh(project)

        # Seed scenarios
        seed_scenario_a(session, project)
        seed_scenario_b(session, project)
        seed_scenario_c(session, project)

        logger.info("All demo scenarios populated and validated successfully.")
    except Exception as e:
        session.rollback()
        logger.error("Seeder execution failed: %s", e, exc_info=True)
        sys.exit(1)
    finally:
        session.close()


if __name__ == "__main__":
    main()
