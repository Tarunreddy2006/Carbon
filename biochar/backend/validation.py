"""
carbon/biochar/backend/validation.py
──────────────────────────────────────────────────────────────────────────────
Compliance Validation Engine
──────────────────────────────────────────────────────────────────────────────
"""

from __future__ import annotations

import logging
from datetime import timedelta
from sqlalchemy.orm import Session

from biochar.backend.database import SessionLocal
from biochar.backend.models import (
    BatchStatus,
    BiocharBatch,
    BiocharApplication,
    BiocharSample,
    LaboratoryTest,
    LaboratoryResult,
    LaboratoryCertificate,
    ReactorSensorLog,
    PyrolysisRun,
    Shipment,
    VerificationTier,
)

logger = logging.getLogger("carbon_engine")


def validate_thermal_stability(batch_id: str, db: Session | None = None) -> bool:
    """
    Validate that the thermal stability parameters of the pyrolysis run were met.
    """
    logger.info("Starting thermal stability validation for batch: %s", batch_id)

    session = db if db is not None else SessionLocal()
    own_session = db is None

    try:
        batch = session.query(BiocharBatch).filter(BiocharBatch.id == batch_id).first()
        if not batch:
            logger.error("BiocharBatch %s not found for thermal stability validation.", batch_id)
            return False

        if not batch.pyrolysis_run_id:
            logger.warning("No PyrolysisRun associated with batch %s. Marking ineligible.", batch_id)
            batch.status = BatchStatus.ineligible.value
            session.commit()
            return False

        # Query all temperature sensor logs sorted chronologically
        telemetry = (
            session.query(ReactorSensorLog)
            .filter(
                ReactorSensorLog.pyrolysis_run_id == batch.pyrolysis_run_id,
                ReactorSensorLog.sensor_name == 'kiln_temperature'
            )
            .order_by(ReactorSensorLog.recorded_at.asc())
            .all()
        )

        if not telemetry:
            logger.warning("No telemetry records found for pyrolysis run %s of batch %s. Marking ineligible.", batch.pyrolysis_run_id, batch_id)
            batch.status = BatchStatus.ineligible.value
            session.commit()
            return False

        low_temp_start = None
        ineligible_detected = False
        running_sum = 0.0
        running_count = 0

        for record in telemetry:
            temp = record.sensor_value
            ts = record.recorded_at

            if temp is None:
                continue

            running_sum += temp
            running_count += 1

            if temp < 350.0:
                if low_temp_start is None:
                    low_temp_start = ts
                else:
                    duration = ts - low_temp_start
                    if duration.total_seconds() > 15 * 60:
                        logger.warning("Violation: temp fell below 350°C for >15 mins.")
                        ineligible_detected = True
                        break
            else:
                low_temp_start = None

        if running_count > 0:
            overall_mean = running_sum / running_count
            if overall_mean <= 350.0:
                logger.warning("Violation: overall mean operating temp <= 350°C.")
                ineligible_detected = True
        else:
            ineligible_detected = True

        if ineligible_detected:
            batch.status = BatchStatus.ineligible.value
            session.commit()
            return False

        logger.info("Thermal stability validation succeeded for batch %s.", batch_id)
        return True

    except Exception as exc:
        logger.error("Error during thermal stability validation: %s", exc)
        try:
            batch = session.query(BiocharBatch).filter(BiocharBatch.id == batch_id).first()
            if batch:
                batch.status = BatchStatus.ineligible.value
                session.commit()
        except Exception:
            session.rollback()
        return False
    finally:
        if own_session:
            session.close()


def evaluate_chemical_permanence(batch_id: str, db: Session | None = None) -> str:
    """
    Evaluate the chemical permanence of a biochar batch based on its H:C ratio.
    Queries the H:C ratio from laboratory_results table.
    """
    logger.info("Starting chemical permanence evaluation for batch: %s", batch_id)

    session = db if db is not None else SessionLocal()
    own_session = db is None

    try:
        batch = session.query(BiocharBatch).filter(BiocharBatch.id == batch_id).first()
        if not batch:
            logger.error("BiocharBatch %s not found.", batch_id)
            return "ineligible"

        if batch.status == BatchStatus.ineligible.value:
            return "ineligible"

        # Query biochar sample -> laboratory test
        sample = session.query(BiocharSample).filter(BiocharSample.biochar_batch_id == batch_id).first()
        if not sample:
            logger.warning("No BiocharSample found for batch %s.", batch_id)
            batch.status = BatchStatus.ineligible.value
            session.commit()
            return "ineligible"

        test = session.query(LaboratoryTest).filter(LaboratoryTest.sample_id == sample.id).first()
        if not test:
            logger.warning("No LaboratoryTest found for sample %s.", sample.id)
            batch.status = BatchStatus.ineligible.value
            session.commit()
            return "ineligible"

        # Query H/C Ratio parameter id: 'ed868532-af4e-4f76-a13b-aca871694df1'
        hc_res = session.query(LaboratoryResult).filter(
            LaboratoryResult.laboratory_test_id == test.id,
            LaboratoryResult.parameter_id == 'ed868532-af4e-4f76-a13b-aca871694df1'
        ).first()

        if not hc_res or hc_res.measured_value is None:
            logger.warning("H:C ratio result is missing for test %s.", test.id)
            batch.status = BatchStatus.ineligible.value
            session.commit()
            return "ineligible"

        ratio = hc_res.measured_value
        logger.info("H:C ratio: %.4f", ratio)

        if ratio > 0.7:
            logger.warning("H:C ratio %.4f > 0.7. Marking ineligible.", ratio)
            batch.status = BatchStatus.ineligible.value
            test.remarks = VerificationTier.pending.value
            session.commit()
            return "ineligible"
        elif ratio <= 0.4:
            tier = VerificationTier.high_permanence_1000yr
        else:
            tier = VerificationTier.standard_200yr

        test.remarks = tier.value
        batch.status = BatchStatus.lab_certified.value
        session.commit()
        return tier.value

    except Exception as exc:
        logger.error("Error evaluating chemical permanence: %s", exc)
        try:
            batch = session.query(BiocharBatch).filter(BiocharBatch.id == batch_id).first()
            if batch:
                batch.status = BatchStatus.ineligible.value
                session.commit()
        except Exception:
            session.rollback()
        return "ineligible"
    finally:
        if own_session:
            session.close()


def calculate_net_sequestration(batch_id: str, db: Session | None = None) -> float:
    """
    Compute the net carbon sequestration in metric tonnes of CO2 equivalent (tCO2e).
    """
    logger.info("Calculating net sequestration for batch: %s", batch_id)

    session = db if db is not None else SessionLocal()
    own_session = db is None

    # Constants
    MOISTURE_FRACTION = 0.10             # 10% average moisture content
    CO2_C_RATIO = 44.0 / 12.0            # Molecular ratio of CO2 to C
    GRID_EMISSION_FACTOR = 0.00082       # tCO2e per kWh
    FUEL_EMISSION_FACTOR = 0.00268       # tCO2e per liter of diesel/fossil fuel

    try:
        batch = session.query(BiocharBatch).filter(BiocharBatch.id == batch_id).first()
        if not batch:
            return 0.0

        # Calculate Gross CO2e
        # 1. Total shipped mass from shipments table (converted from kg to tonnes)
        shipments = session.query(Shipment).filter(Shipment.biochar_batch_id == batch_id).all()
        total_shipped_mass_kg = sum(s.shipped_weight_kg or 0.0 for s in shipments)
        total_shipped_mass = total_shipped_mass_kg / 1000.0
        dry_biochar_mass = total_shipped_mass * (1.0 - MOISTURE_FRACTION)

        # 2. Get organic carbon percentage from LaboratoryResult (Organic Carbon parameter: '7af73dff-26e6-4c98-abee-251cb4261c62')
        organic_carbon_percentage = 0.0
        sample = session.query(BiocharSample).filter(BiocharSample.biochar_batch_id == batch_id).first()
        if sample:
            test = session.query(LaboratoryTest).filter(LaboratoryTest.sample_id == sample.id).first()
            if test:
                oc_res = session.query(LaboratoryResult).filter(
                    LaboratoryResult.laboratory_test_id == test.id,
                    LaboratoryResult.parameter_id == '7af73dff-26e6-4c98-abee-251cb4261c62'
                ).first()
                if oc_res:
                    organic_carbon_percentage = oc_res.measured_value or 0.0

        gross_co2e = dry_biochar_mass * (organic_carbon_percentage / 100.0) * CO2_C_RATIO

        # 3. Calculate Processing Utility Emissions from PyrolysisRun
        total_electricity = 0.0
        total_fossil_fuel = 0.0
        if batch.pyrolysis_run_id:
            run = session.query(PyrolysisRun).filter(PyrolysisRun.id == batch.pyrolysis_run_id).first()
            if run:
                total_electricity = run.electricity_kwh or 0.0
                total_fossil_fuel = run.fuel_used_liters or 0.0

        utility_emissions = (total_electricity * GRID_EMISSION_FACTOR) + (total_fossil_fuel * FUEL_EMISSION_FACTOR)
        net_co2e = gross_co2e - utility_emissions

        logger.info(
            "Batch %s calculation: Shipped=%s, Dry=%s, OrgC=%s%%, Gross CO2e=%s, Net CO2e=%s",
            batch_id, total_shipped_mass, dry_biochar_mass, organic_carbon_percentage, gross_co2e, net_co2e
        )
        return float(net_co2e)

    except Exception as exc:
        logger.error("Error during sequestration calculation: %s", exc)
        session.rollback()
        raise exc
    finally:
        if own_session:
            session.close()


def check_batch_delivery_completion(batch_id: str, db: Session | None = None) -> bool:
    """
    Query all Shipment records for the batch.
    If 100% of shipments are completed ('delivered'), update BiocharBatch.status to completed.
    """
    logger.info("Checking batch delivery completion for batch_id: %s", batch_id)
    session = db if db is not None else SessionLocal()
    own_session = db is None
    try:
        batch = session.query(BiocharBatch).filter(BiocharBatch.id == batch_id).first()
        if not batch:
            return False

        shipments = session.query(Shipment).filter(Shipment.biochar_batch_id == batch_id).all()
        if not shipments:
            return False

        all_completed = all(s.status == 'delivered' for s in shipments)
        if all_completed:
            batch.status = BatchStatus.completed.value
            session.commit()
            return True
        return False
    except Exception as exc:
        logger.error("Error checking delivery completion: %s", exc)
        session.rollback()
        raise exc
    finally:
        if own_session:
            session.close()
