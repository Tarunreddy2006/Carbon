"""
main.py
─────────────────────────────────────────────────────────────────────────────
Carbon Biomass Intelligence Engine – FastAPI application entry point.

Run with:
    uvicorn main:app --reload --host 0.0.0.0 --port 8000

Swagger UI:   http://localhost:8000/docs
ReDoc:        http://localhost:8000/redoc
OpenAPI JSON: http://localhost:8000/openapi.json
─────────────────────────────────────────────────────────────────────────────
"""

from __future__ import annotations

import logging
import os
import sys
from contextlib import asynccontextmanager
from typing import AsyncIterator

from dotenv import load_dotenv
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

# ── Load .env before any service imports that read os.getenv ──────────────────
load_dotenv()

# ── Logging setup ─────────────────────────────────────────────────────────────
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()
logging.basicConfig(
    stream=sys.stdout,
    level=getattr(logging, LOG_LEVEL, logging.INFO),
    format="%(asctime)s  %(levelname)-8s  %(name)s – %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)
logger = logging.getLogger("carbon_engine")

# ── Lazy GEE initialisation import (after .env is loaded) ────────────────────
from services.service import initialise_gee    # noqa: E402
from routes.estimate import router as estimate_router  # noqa: E402


# ─── Lifespan handler (startup / shutdown) ────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """
    Application lifespan context manager.

    Startup
    ───────
    • Attempt GEE authentication eagerly so that the first request is not
      slowed by the OAuth handshake.  If GEE credentials are not configured
      (e.g. CI environment) we log a warning and continue – the /demo
      endpoint still works without GEE.

    Shutdown
    ────────
    • Nothing to clean up (stateless service).
    """
    logger.info("═══════════════════════════════════════════════════════")
    logger.info("  Carbon Biomass Intelligence Engine – starting up")
    logger.info("  ENV: %s", os.getenv("APP_ENV", "development"))
    logger.info("═══════════════════════════════════════════════════════")

    try:
        initialise_gee()
        logger.info("✔  Google Earth Engine authenticated and ready")
    except Exception as exc:
        logger.warning(
            "⚠  GEE authentication failed at startup (%s). "
            "The /estimate-carbon/demo endpoint is still available.",
            exc,
        )

    yield  # ← application runs here

    logger.info("Carbon Biomass Intelligence Engine – shutting down")


# ─── Application factory ──────────────────────────────────────────────────────

def create_app() -> FastAPI:
    app = FastAPI(
        title       = "Carbon Biomass Intelligence Engine",
        description = (
            "Geospatial API that estimates vegetation biomass, carbon storage, "
            "and CO₂ equivalent from Sentinel-2 satellite imagery for land "
            "parcels in Karnataka, India.\n\n"
        ),
        version     = "1.0.0",
        contact     = {
            "name":  "Carbon Engine Team",
            "email": "team@carbon-engine.example.com",
        },
        license_info= {
            "name": "MIT",
        },
        lifespan    = lifespan,
        docs_url    = "/docs",
        redoc_url   = "/redoc",
    )

    # ── CORS ──────────────────────────────────────────────────────────────
    raw_origins = os.getenv(
        "CORS_ORIGINS",
        "http://localhost:3000,http://127.0.0.1:5500,http://localhost:5500"
    )
    origins = [o.strip() for o in raw_origins.split(",") if o.strip()]

    app.add_middleware(
        CORSMiddleware,
        allow_origins     = origins,
        allow_credentials = True,
        allow_methods     = ["*"],
        allow_headers     = ["*"],
    )

    # ── Routers ───────────────────────────────────────────────────────────
    app.include_router(estimate_router)

    # ── Global exception handlers ─────────────────────────────────────────

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(
        request: Request, exc: Exception
    ) -> JSONResponse:
        logger.error(
            "Unhandled exception on %s %s: %s",
            request.method, request.url.path, exc,
            exc_info=True,
        )
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "status":  "error",
                "code":    500,
                "message": "An unexpected error occurred.",
                "detail":  str(exc) if os.getenv("APP_ENV") == "development" else None,
            },
        )

    # ── Root probe ────────────────────────────────────────────────────────

    @app.get(
        "/",
        summary="Root health check",
        tags=["Health"],
        status_code=status.HTTP_200_OK,
    )
    async def root() -> dict:
        return {
            "service": "Carbon Biomass Intelligence Engine",
            "version": "1.0.0",
            "status":  "running",
            "docs":    "/docs",
        }

    @app.get(
        "/health",
        summary="Liveness probe",
        tags=["Health"],
        status_code=status.HTTP_200_OK,
    )
    async def health() -> dict:
        return {"status": "ok"}

    return app


# ─── ASGI application object ──────────────────────────────────────────────────
app = create_app()
