"""
carbon/biochar/backend/validation.py
──────────────────────────────────────────────────────────────────────────────
Compliance Validation Engine

Provides deterministic validation functions for:
1. Thermal stability verification (PyrolysisTelemetry sensor analysis).
2. Chemical permanence classification (LabAssay analysis).
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
    DistributionSink,
    LabAssay,
    PyrolysisTelemetry,
    VerificationTier,
)

logger = logging.getLogger("carbon_engine")


def validate_thermal_stability(batch_id: str, db: Session | None = None) -> bool:
    """
    Validate that the thermal stability parameters of the pyrolysis run were met.

    Requirements:
    - Query PyrolysisTelemetry records for the given batch.
    - Compute the running mean operating temperature.
    - Verify operating temperature remained strictly greater than 350°C.
    - Detect any continuous period longer than 15 consecutive minutes where temperature fell below 350°C.
    - If a violation is detected:
      - Update BiocharBatch.status to ineligible
      - Commit transaction
      - Abort validation
      - Return False
    """
    logger.info("Starting thermal stability validation for batch: %s", batch_id)

    session = db if db is not None else SessionLocal()
    own_session = db is None

    try:
        # Fetch the target biochar batch
        batch = session.query(BiocharBatch).filter(BiocharBatch.id == batch_id).first()
        if not batch:
            logger.error("BiocharBatch %s not found for thermal stability validation.", batch_id)
            return False

        # Query all PyrolysisTelemetry records sorted chronologically
        telemetry = (
            session.query(PyrolysisTelemetry)
            .filter(PyrolysisTelemetry.batch_id == batch_id)
            .order_by(PyrolysisTelemetry.timestamp.asc())
            .all()
        )

        if not telemetry:
            logger.warning("No telemetry records found for batch %s. Marking ineligible.", batch_id)
            batch.status = BatchStatus.ineligible
            session.commit()
            return False

        # Verify operating temperatures and track continuous low temperature periods
        running_sum = 0.0
        running_count = 0
        low_temp_start = None
        ineligible_detected = False

        for record in telemetry:
            temp = record.kiln_temperature_celsius
            ts = record.timestamp

            running_sum += temp
            running_count += 1
            running_mean = running_sum / running_count

            logger.debug(
                "Telemetry record ID: %s, Temp: %.2f°C, Running Mean: %.2f°C",
                record.id, temp, running_mean
            )

            if temp < 350.0:
                if low_temp_start is None:
                    low_temp_start = ts
                else:
                    duration = ts - low_temp_start
                    if duration.total_seconds() > 15 * 60:
                        logger.warning(
                            "Violation detected: temperature fell below 350°C for %s "
                            "(longer than 15 consecutive minutes, from %s to %s)",
                            duration, low_temp_start, ts
                        )
                        ineligible_detected = True
                        break
            else:
                low_temp_start = None

        # Verify running/overall mean operating temperature is strictly greater than 350°C
        overall_mean = running_sum / running_count
        if overall_mean <= 350.0:
            logger.warning(
                "Violation detected: overall mean operating temperature %.2f°C is not strictly greater than 350°C",
                overall_mean
            )
            ineligible_detected = True

        if ineligible_detected:
            batch.status = BatchStatus.ineligible
            session.commit()
            return False

        logger.info("Thermal stability validation succeeded for batch %s.", batch_id)
        return True

    except Exception as exc:
        logger.error(
            "Unexpected error during thermal stability validation for batch %s: %s",
            batch_id, exc, exc_info=True
        )
        try:
            # On unexpected validation failures automatically mark the batch as ineligible.
            batch = session.query(BiocharBatch).filter(BiocharBatch.id == batch_id).first()
            if batch:
                batch.status = BatchStatus.ineligible
                session.commit()
        except Exception as rollback_exc:
            logger.error("Failed to mark batch as ineligible after unexpected exception: %s", rollback_exc)
            session.rollback()
        return False
    finally:
        if own_session:
            session.close()


def evaluate_chemical_permanence(batch_id: str, db: Session | None = None) -> str:
    """
    Evaluate the chemical permanence of a biochar batch based on its LabAssay ratio.

    Requirements:
    - Read the unique LabAssay record.
    - Rule A: If molar_hc_ratio > 0.7:
      - Mark batch ineligible
      - Commit transaction
      - Return status ("ineligible")
    - Rule B: If molar_hc_ratio <= 0.4:
      - verification_tier = high_permanence_1000yr
    - Rule C: If 0.4 < molar_hc_ratio <= 0.7:
      - verification_tier = standard_200yr
    - Update database and return the resulting verification tier.
    """
    logger.info("Starting chemical permanence evaluation for batch: %s", batch_id)

    session = db if db is not None else SessionLocal()
    own_session = db is None

    try:
        # Fetch the target biochar batch
        batch = session.query(BiocharBatch).filter(BiocharBatch.id == batch_id).first()
        if not batch:
            logger.error("BiocharBatch %s not found for chemical permanence evaluation.", batch_id)
            return "ineligible"

        if batch.status == BatchStatus.ineligible:
            logger.warning("BiocharBatch %s is already marked ineligible. Aborting chemical permanence evaluation.", batch_id)
            return "ineligible"

        # Read unique LabAssay record
        assay = session.query(LabAssay).filter(LabAssay.batch_id == batch_id).first()
        if not assay:
            logger.warning("No LabAssay record found for batch %s. Marking ineligible.", batch_id)
            batch.status = BatchStatus.ineligible
            session.commit()
            return "ineligible"

        ratio = assay.molar_hc_ratio
        logger.info("Molar H:C ratio for batch %s: %.4f", batch_id, ratio)

        if ratio > 0.7:
            logger.warning("Rule A Violation: molar H:C ratio %.4f > 0.7. Marking ineligible.", ratio)
            batch.status = BatchStatus.ineligible
            assay.verification_tier = VerificationTier.pending
            session.commit()
            return "ineligible"

        elif ratio <= 0.4:
            # Rule B
            tier = VerificationTier.high_permanence_1000yr
            logger.info("Rule B Met: molar H:C ratio %.4f <= 0.4. Tier: %s", ratio, tier.value)

        else:
            # Rule C: 0.4 < ratio <= 0.7
            tier = VerificationTier.standard_200yr
            logger.info("Rule C Met: 0.4 < molar H:C ratio %.4f <= 0.7. Tier: %s", ratio, tier.value)

        # Update database with results
        assay.verification_tier = tier
        batch.status = BatchStatus.lab_certified
        session.commit()
        return tier.value

    except Exception as exc:
        logger.error(
            "Unexpected error during chemical permanence evaluation for batch %s: %s",
            batch_id, exc, exc_info=True
        )
        try:
            # On unexpected validation failures automatically mark the batch as ineligible.
            batch = session.query(BiocharBatch).filter(BiocharBatch.id == batch_id).first()
            if batch:
                batch.status = BatchStatus.ineligible
                session.commit()
        except Exception as rollback_exc:
            logger.error("Failed to mark batch as ineligible after unexpected exception: %s", rollback_exc)
            session.rollback()
        return "ineligible"
    finally:
        if own_session:
            session.close()


def calculate_net_sequestration(batch_id: str, db: Session | None = None) -> float:
    """
    Compute the net carbon sequestration in metric tonnes of CO2 equivalent (tCO2e).
    Formula:
        Net CO2e = Gross CO2e - Processing Utility Emissions

    Where:
        Gross CO2e = Dry Biochar Mass * (Organic Carbon % / 100) * (44 / 12)
        Dry Biochar Mass = Total Shipped Mass * (1 - Moisture Fraction)
        Processing Utility Emissions = (Total Electricity kWh * Grid Factor) + (Total Fossil Fuel Liters * Fuel Factor)
    """
    logger.info("Calculating net sequestration for batch: %s", batch_id)

    session = db if db is not None else SessionLocal()
    own_session = db is None

    # Constants
    MOISTURE_FRACTION = 0.10             # 10% average moisture content
    CO2_C_RATIO = 44.0 / 12.0            # Molecular ratio of CO2 to C
    GRID_EMISSION_FACTOR = 0.00082       # tCO2e per kWh (standard India grid factor)
    FUEL_EMISSION_FACTOR = 0.00268       # tCO2e per liter of diesel/fossil fuel

    try:
        # Fetch the batch
        batch = session.query(BiocharBatch).filter(BiocharBatch.id == batch_id).first()
        if not batch:
            logger.error("BiocharBatch %s not found for sequestration calculation.", batch_id)
            return 0.0

        # Calculate Gross CO2e
        # 1. Total shipped mass from distribution sinks
        total_shipped_mass = sum(sink.shipped_mass_tons for sink in batch.distribution_sinks)
        dry_biochar_mass = total_shipped_mass * (1.0 - MOISTURE_FRACTION)

        # 2. Get organic carbon percentage from LabAssay
        organic_carbon_percentage = 0.0
        if batch.lab_assay:
            organic_carbon_percentage = batch.lab_assay.organic_carbon_percentage
        else:
            logger.warning("No LabAssay found for batch %s. Assuming 0%% organic carbon.", batch_id)

        gross_co2e = dry_biochar_mass * (organic_carbon_percentage / 100.0) * CO2_C_RATIO

        # Calculate Processing Utility Emissions from Telemetry
        total_electricity = sum(t.electricity_consumption_kwh for t in batch.pyrolysis_telemetry)
        total_fossil_fuel = sum(t.fossil_fuel_consumption_liters for t in batch.pyrolysis_telemetry)

        utility_emissions = (total_electricity * GRID_EMISSION_FACTOR) + (total_fossil_fuel * FUEL_EMISSION_FACTOR)

        net_co2e = gross_co2e - utility_emissions
        logger.info(
            "Batch %s calculation: Shipped=%s, Dry=%s, OrgC=%s%%, Gross CO2e=%s, "
            "Elec=%s kWh, Fuel=%s L, Utility Emissions=%s, Net CO2e=%s",
            batch_id, total_shipped_mass, dry_biochar_mass, organic_carbon_percentage,
            gross_co2e, total_electricity, total_fossil_fuel, utility_emissions, net_co2e
        )

        batch.net_sequestration_tco2e = net_co2e
        session.commit()
        return float(net_co2e)

    except Exception as exc:
        logger.error(
            "Unexpected error during sequestration calculation for batch %s: %s",
            batch_id, exc, exc_info=True
        )
        session.rollback()
        raise exc
    finally:
        if own_session:
            session.close()


def check_batch_delivery_completion(batch_id: str, db: Session | None = None) -> bool:
    """
    Query all DistributionSink records for the batch.
    Verify every distribution record has a populated attestation_timestamp.
    If 100% of deliveries are completed, update BiocharBatch.status to completed.
    """
    logger.info("Checking batch delivery completion for batch_id: %s", batch_id)
    session = db if db is not None else SessionLocal()
    own_session = db is None
    try:
        batch = session.query(BiocharBatch).filter(BiocharBatch.id == batch_id).first()
        if not batch:
            logger.error("BiocharBatch %s not found for delivery completion check.", batch_id)
            return False

        sinks = session.query(DistributionSink).filter(DistributionSink.batch_id == batch_id).all()
        if not sinks:
            logger.warning("No distribution sinks found for batch %s.", batch_id)
            return False

        all_completed = all(s.attestation_timestamp is not None for s in sinks)
        if all_completed:
            logger.info("All deliveries (%d) for batch %s are completed. Updating status to completed.", len(sinks), batch_id)
            batch.status = BatchStatus.completed
            session.commit()
            return True
        else:
            completed_count = sum(1 for s in sinks if s.attestation_timestamp is not None)
            logger.info("Batch %s deliveries are not fully completed yet (%d/%d completed).", batch_id, completed_count, len(sinks))
            return False
    except Exception as exc:
        logger.error("Unexpected error checking delivery completion for batch %s: %s", batch_id, exc, exc_info=True)
        session.rollback()
        raise exc
    finally:
        if own_session:
            session.close()


