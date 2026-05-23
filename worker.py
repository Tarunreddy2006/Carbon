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
REDIS_URL = os.getenv("REDIS_URL","rediss://default:gQAAAAAAAZUrAAIgcDEzNDVmZjgwOTc2YzE0MjFhYjUyN2M3OGI5MjFkMDFlOQ@eager-javelin-103723.upstash.io:6379")

celery_app = Celery(
    "carbon_mrv_worker",
    broker=REDIS_URL,
    backend=REDIS_URL,
    include=["tasks"] # This points to our tasks.py file
)

# Schedule the Deforestation Sentinel to run on the 1st of every month
celery_app.conf.beat_schedule = {
    "monthly_deforestation_audit": {
        "task": "tasks.run_continuous_mrv_audit",
        "schedule": crontab(day_of_month='1', hour=0, minute=0),
    },
}
celery_app.conf.timezone = 'UTC'
