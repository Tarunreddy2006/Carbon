"""
worker.py
─────────────────────────────────────────────────────────────────────────────
Celery background worker configuration for Continuous MRV.
─────────────────────────────────────────────────────────────────────────────
"""
import os
from celery import Celery
from celery.schedules import crontab

# Connect to local Redis broker
REDIS_URL = os.getenv("REDIS_URL")

celery_app = Celery(
    "carbon_mrv_worker",
    broker=REDIS_URL,
    backend=REDIS_URL,
    include=["ARR.tasks"]  # Fully-qualified path for Celery task discovery
)

# Schedule the Deforestation Sentinel to run on the 1st of every month
celery_app.conf.beat_schedule = {
    "monthly_deforestation_audit": {
        "task": "ARR.tasks.run_continuous_mrv_audit",
        "schedule": crontab(day_of_month='1', hour=0, minute=0),
    },
}
celery_app.conf.timezone = 'UTC'
