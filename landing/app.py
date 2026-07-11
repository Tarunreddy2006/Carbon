"""
landing/app.py
──────────────────────────────────────────────────────────────────────────────
FastAPI application for the Stomata landing page.
Served at app.stomata.tech — provides a gateway to choose between
ARR (arr.stomata.tech) and Biochar (biochar.stomata.tech) verticals.
──────────────────────────────────────────────────────────────────────────────
"""
from __future__ import annotations

import os
import logging
import sys

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

logging.basicConfig(
    stream  = sys.stdout,
    level   = logging.INFO,
    format  = "%(asctime)s  %(levelname)-8s  %(name)s – %(message)s",
    datefmt = "%Y-%m-%dT%H:%M:%S",
)
logger = logging.getLogger("landing")

CORS_ORIGINS = [
    "https://app.stomata.tech",
    "https://arr.stomata.tech",
    "https://biochar.stomata.tech",
    "https://stomata.tech",
    "https://www.stomata.tech",
    "http://localhost:8000",
]


def create_app() -> FastAPI:
    application = FastAPI(
        title       = "Stomata Platform",
        description = "Gateway to Stomata carbon credit verticals.",
        version     = "1.0.0",
    )

    application.add_middleware(
        CORSMiddleware,
        allow_origins     = CORS_ORIGINS,
        allow_credentials = True,
        allow_methods     = ["*"],
        allow_headers     = ["*"],
    )

    @application.get("/health", tags=["Health"])
    async def health():
        return {"status": "ok", "service": "landing"}

    # Serve landing page static files
    frontend_dir = os.path.join(os.path.dirname(__file__), "frontend")
    if os.path.isdir(frontend_dir):
        application.mount("/", StaticFiles(directory=frontend_dir, html=True), name="landing-frontend")

    return application


app = create_app()
