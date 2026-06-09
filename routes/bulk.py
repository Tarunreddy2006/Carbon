"""
routes/bulk.py
─────────────────────────────────────────────────────────────────────────────
API endpoints for the mass-parallelized bulk parcel auditing subsystem.

POST /api/v1/audit/bulk      → Upload CSV, create job + items, fan out tasks
GET  /api/v1/audit/status/{} → Poll job progress (total vs. processed)
GET  /api/v1/audit/export/{} → Stream finished results as downloadable CSV
─────────────────────────────────────────────────────────────────────────────
"""
from __future__ import annotations

import csv
import io
import logging
import uuid
import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status, BackgroundTasks
from fastapi.responses import JSONResponse, StreamingResponse
from sqlalchemy.orm import Session
from celery import group

from database.db import get_db
from database.models import BulkJob, BulkItem, JobStatus
from services.auth import get_current_user
from tasks import async_process_bulk_item

logger = logging.getLogger("bulk_audit")

router = APIRouter(
    prefix="/api/v1/audit",
    tags=["Bulk Audit"]
)

# ── Maximum rows per CSV upload (safety guard) ────────────────────────────
MAX_CSV_ROWS = 10_000
# ── Required CSV columns for Point-Radius check ───────────────────────────
REQUIRED_COLUMNS = {"latitude", "longitude"}


# ═══════════════════════════════════════════════════════════════════════════
# POST /api/v1/audit/bulk — Upload CSV and Dispatch
# ═══════════════════════════════════════════════════════════════════════════

@router.post("/bulk", status_code=status.HTTP_202_ACCEPTED)
async def upload_bulk_csv(
    file: UploadFile = File(...),
    user_token: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Ingest a corporate CSV file containing target coordinates.

    Supports two polymorphic formats:
      1. Point-Radius Mode:
         - latitude (required)
         - longitude (required)
         - parcel_label / label / plot_id / farm_id (optional)
         - radius_meters (optional — defaults to 500m)
      2. Coordinates Polygon Matrix Mode:
         - coordinates (required — array of [lat, lon] vertices)
         - parcel_label / label / plot_id / farm_id (optional)

    Creates one BulkJob with N BulkItems in a single atomic transaction,
    then dispatches a Celery group() to fan tasks across worker nodes.
    """
    # ── Auth gate: institution only ───────────────────────────────────────
    user_id = user_token.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="User ID missing from token")

    if user_token.get("role") != "institution":
        raise HTTPException(status_code=403, detail="Only Institutional Auditors can run bulk audits.")

    # ── File validation ───────────────────────────────────────────────────
    if not file.filename:
        raise HTTPException(status_code=422, detail="No file uploaded.")

    if not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=422, detail="Only .csv files are accepted.")

    # ── Read and parse CSV ────────────────────────────────────────────────
    try:
        raw_bytes = await file.read()
        text_content = raw_bytes.decode("utf-8-sig")  # Handle BOM from Excel exports
        reader = csv.DictReader(io.StringIO(text_content))
    except UnicodeDecodeError:
        raise HTTPException(status_code=422, detail="File encoding error. Please upload a UTF-8 CSV.")
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"CSV parse error: {str(e)}")

    # ── Validate column headers ───────────────────────────────────────────
    if not reader.fieldnames:
        raise HTTPException(status_code=422, detail="CSV file is empty or has no header row.")

    header_set = {col.strip().lower() for col in reader.fieldnames}

    has_lat_lon = REQUIRED_COLUMNS.issubset(header_set)
    has_coords = "coordinates" in header_set

    if not (has_lat_lon or has_coords):
        raise HTTPException(
            status_code=422,
            detail=f"CSV file must contain either 'latitude' and 'longitude' columns or a 'coordinates' column. "
                   f"Found columns: {', '.join(reader.fieldnames)}"
        )

    # ── Normalize column name mapping (case-insensitive) ──────────────────
    col_map = {}
    for raw_col in reader.fieldnames:
        col_map[raw_col.strip().lower()] = raw_col

    # ── Parse rows into validated entries ─────────────────────────────────
    rows = []
    parse_errors = []

    for row_idx, row in enumerate(reader):
        if row_idx >= MAX_CSV_ROWS:
            parse_errors.append(f"Row limit exceeded. Maximum {MAX_CSV_ROWS} rows per file.")
            break

        # Label fallback mapping (parcel_label, label, plot_id, farm_id)
        label = ""
        label_keys = ["parcel_label", "label", "plot_id", "farm_id"]
        for lk in label_keys:
            if lk in col_map:
                raw_val = row.get(col_map[lk], "")
                if raw_val:
                    label = raw_val.strip()
                    break
        if not label:
            label = f"Point-{row_idx + 1}"

        # Determine if coordinates matrix exists in this row
        has_coords_val = False
        coords_raw = ""
        if "coordinates" in col_map:
            coords_raw = row.get(col_map["coordinates"], "").strip()
            if coords_raw:
                has_coords_val = True

        lat = 0.0
        lon = 0.0
        radius = 500.0
        custom_geom = None

        if has_coords_val:
            try:
                parsed_coords = json.loads(coords_raw)
                if not isinstance(parsed_coords, list):
                    raise ValueError("Coordinates column must be a JSON array.")
                if len(parsed_coords) < 3:
                    raise ValueError("A polygon coordinates array must contain at least 3 vertices.")

                inverted = []
                for vertex in parsed_coords:
                    if not isinstance(vertex, list) or len(vertex) < 2:
                        raise ValueError("Each vertex must be a list containing at least [latitude, longitude].")
                    
                    lat_val = float(vertex[0])
                    lon_val = float(vertex[1])

                    if not (-90.0 <= lat_val <= 90.0):
                        raise ValueError(f"Latitude {lat_val} out of range [-90, 90].")
                    if not (-180.0 <= lon_val <= 180.0):
                        raise ValueError(f"Longitude {lon_val} out of range [-180, 180].")

                    # Invert human-readable [latitude, longitude] to strict GeoJSON/PostGIS [longitude, latitude]
                    inverted.append([lon_val, lat_val])

                # Ensure the linear ring is closed implicitly
                if inverted[0] != inverted[-1]:
                    inverted.append(list(inverted[0]))

                # Calculate the basic mean average of latitudes and longitudes
                avg_lat = sum(v[0] for v in parsed_coords) / len(parsed_coords)
                avg_lon = sum(v[1] for v in parsed_coords) / len(parsed_coords)

                lat = avg_lat
                lon = avg_lon
                custom_geom = {
                    "type": "Polygon",
                    "coordinates": [inverted]
                }
            except Exception as parse_err:
                parse_errors.append(f"Row {row_idx + 1}: Coordinates parse failure — {str(parse_err)}")
                continue
        else:
            # Point-Radius Mode
            lat_col = col_map.get("latitude", "")
            lon_col = col_map.get("longitude", "")
            lat_raw = row.get(lat_col, "").strip() if lat_col else ""
            lon_raw = row.get(lon_col, "").strip() if lon_col else ""

            if not lat_raw or not lon_raw:
                parse_errors.append(f"Row {row_idx + 1}: Missing latitude/longitude or coordinates.")
                continue

            try:
                lat = float(lat_raw)
                lon = float(lon_raw)

                # Sanity-check coordinate ranges
                if not (-90.0 <= lat <= 90.0):
                    parse_errors.append(f"Row {row_idx + 1}: Latitude {lat} out of range [-90, 90].")
                    continue
                if not (-180.0 <= lon <= 180.0):
                    parse_errors.append(f"Row {row_idx + 1}: Longitude {lon} out of range [-180, 180].")
                    continue

                radius_col = col_map.get("radius_meters", col_map.get("radius", ""))
                radius_raw = row.get(radius_col, "").strip() if radius_col else ""
                radius = float(radius_raw) if radius_raw else 500.0

                if radius <= 0 or radius > 50000:
                    radius = 500.0

            except ValueError as ve:
                parse_errors.append(f"Row {row_idx + 1}: Invalid numeric value — {str(ve)}")
                continue

        rows.append({
            "row_index": row_idx,
            "parcel_label": label,
            "latitude": lat,
            "longitude": lon,
            "radius_meters": radius,
            "custom_geometry": custom_geom
        })

    if not rows:
        raise HTTPException(
            status_code=422,
            detail={
                "message": "No valid rows found in CSV.",
                "parse_errors": parse_errors[:20]
            }
        )

    # ── Create BulkJob + BulkItems in a single atomic transaction ─────────
    job = BulkJob(
        user_id=user_id,
        filename=file.filename,
        status=JobStatus.PROCESSING,
        total_rows=len(rows),
        processed_rows=0,
        created_at=datetime.now(timezone.utc)
    )
    db.add(job)
    db.flush()  # Generate job.id without committing

    bulk_items = []
    for r in rows:
        item = BulkItem(
            job_id=job.id,
            row_index=r["row_index"],
            parcel_label=r["parcel_label"],
            latitude=r["latitude"],
            longitude=r["longitude"],
            radius_meters=r["radius_meters"],
            custom_geometry=r["custom_geometry"],
            status=JobStatus.PENDING
        )
        db.add(item)
        bulk_items.append(item)

    db.commit()
    db.refresh(job)

    # ── Dispatch Celery group() — fan out across worker nodes ─────────────
    task_signatures = [
        async_process_bulk_item.s(str(item.id))
        for item in bulk_items
    ]

    task_group = group(task_signatures)
    task_group.apply_async()

    logger.info(
        f"🚀 Bulk audit job {job.id} dispatched: "
        f"{len(bulk_items)} items over Celery group()"
    )

    return {
        "job_id": str(job.id),
        "filename": file.filename,
        "total_rows": len(rows),
        "status": "PROCESSING",
        "parse_warnings": parse_errors[:10] if parse_errors else []
    }


# ═══════════════════════════════════════════════════════════════════════════
# GET /api/v1/audit/status/{job_id} — Progress Polling
# ═══════════════════════════════════════════════════════════════════════════

@router.get("/status/{job_id}")
async def get_bulk_status(
    job_id: str,
    user_token: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Fast polling gateway returning job progress percentage and row counts.
    """
    user_id = user_token.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="User ID missing from token")

    if user_token.get("role") != "institution":
        raise HTTPException(status_code=403, detail="Only Institutional Auditors can view bulk status.")

    try:
        job_uuid = uuid.UUID(job_id)
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid job ID format.")

    job = db.query(BulkJob).filter(
        BulkJob.id == job_uuid,
        BulkJob.user_id == user_id
    ).first()

    if not job:
        raise HTTPException(status_code=404, detail="Bulk audit job not found.")

    percent_complete = 0.0
    if job.total_rows > 0:
        percent_complete = round((job.processed_rows / job.total_rows) * 100.0, 1)

    return {
        "job_id": str(job.id),
        "filename": job.filename,
        "status": job.status.value,
        "total_rows": job.total_rows,
        "processed_rows": job.processed_rows,
        "percent_complete": percent_complete,
        "created_at": job.created_at.isoformat() if job.created_at else None,
        "completed_at": job.completed_at.isoformat() if job.completed_at else None
    }


# ═══════════════════════════════════════════════════════════════════════════
# GET /api/v1/audit/export/{job_id} — Streaming CSV Export
# ═══════════════════════════════════════════════════════════════════════════

@router.get("/export/{job_id}")
async def export_bulk_csv(
    job_id: str,
    user_token: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Stream a cleanly structured CSV containing all finished coordinates,
    calculated asset metrics, and processing errors.
    """
    user_id = user_token.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="User ID missing from token")

    if user_token.get("role") != "institution":
        raise HTTPException(status_code=403, detail="Only Institutional Auditors can export bulk results.")

    try:
        job_uuid = uuid.UUID(job_id)
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid job ID format.")

    job = db.query(BulkJob).filter(
        BulkJob.id == job_uuid,
        BulkJob.user_id == user_id
    ).first()

    if not job:
        raise HTTPException(status_code=404, detail="Bulk audit job not found.")

    # ── Fetch all items ordered by row index ──────────────────────────────
    items = db.query(BulkItem).filter(
        BulkItem.job_id == job_uuid
    ).order_by(BulkItem.row_index).all()

    # ── Stream CSV ────────────────────────────────────────────────────────
    def generate_csv():
        output = io.StringIO()
        writer = csv.writer(output)

        # Header row
        writer.writerow([
            "row_index",
            "parcel_label",
            "latitude",
            "longitude",
            "radius_meters",
            "status",
            "calculated_area_ha",
            "ndvi_mean",
            "co2_equivalent_tons",
            "confidence_score",
            "error_message"
        ])
        yield output.getvalue()
        output.seek(0)
        output.truncate(0)

        # Data rows
        for item in items:
            writer.writerow([
                item.row_index,
                item.parcel_label or "",
                item.latitude,
                item.longitude,
                item.radius_meters,
                item.status.value if item.status else "UNKNOWN",
                round(item.calculated_area_ha, 4) if item.calculated_area_ha else "",
                round(item.ndvi_mean, 4) if item.ndvi_mean else "",
                round(item.co2_equivalent_tons, 2) if item.co2_equivalent_tons else "",
                round(item.confidence_score, 1) if item.confidence_score else "",
                item.error_message or ""
            ])
            yield output.getvalue()
            output.seek(0)
            output.truncate(0)

    safe_filename = job.filename.replace('"', '').replace("'", "") if job.filename else "export"
    export_name = f"bulk_audit_{safe_filename}_{job_id[:8]}.csv"

    return StreamingResponse(
        generate_csv(),
        media_type="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="{export_name}"',
            "X-Job-Status": job.status.value,
            "X-Total-Rows": str(job.total_rows),
            "X-Processed-Rows": str(job.processed_rows)
        }
    )
