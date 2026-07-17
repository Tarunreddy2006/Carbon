"""
biochar/app.py
──────────────────────────────────────────────────────────────────────────────
FastAPI application entry point for the Biochar Carbon-Removal Pipeline.
Served at biochar.stomata.tech
──────────────────────────────────────────────────────────────────────────────
"""
from __future__ import annotations

import logging
import os
import sys
import time
from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException

from biochar.backend.database import engine, Base

logging.basicConfig(
    stream  = sys.stdout,
    level   = logging.INFO,
    format  = "%(asctime)s  %(levelname)-8s  %(name)s – %(message)s",
    datefmt = "%Y-%m-%dT%H:%M:%S",
)
logger = logging.getLogger("biochar_engine")

APP_ENV = os.getenv("APP_ENV", "development")

CORS_ORIGINS = os.getenv(
    "BIOCHAR_CORS_ORIGINS",
    os.getenv("CORS_ORIGINS", '["https://biochar.stomata.tech","https://app.stomata.tech","http://localhost:8002"]'),
)

# Parse CORS origins from string or JSON
import json
try:
    _origins = json.loads(CORS_ORIGINS) if isinstance(CORS_ORIGINS, str) else CORS_ORIGINS
except (json.JSONDecodeError, TypeError):
    _origins = [CORS_ORIGINS] if isinstance(CORS_ORIGINS, str) else ["*"]


@asynccontextmanager
async def lifespan(application: FastAPI) -> AsyncIterator[None]:
    logger.info("═══════════════════════════════════════════════════════")
    logger.info("  Biochar Carbon-Removal Pipeline – starting up")
    logger.info("═══════════════════════════════════════════════════════")

    try:
        logger.info("Connecting to Stomata Biochar Database (PostgreSQL)...")
        logger.info("✔  Stomata ORM models loaded (%d tables mapped). Database schema managed via Supabase.", len(Base.metadata.tables))
    except Exception as exc:
        logger.error("❌  Failed during startup verification (%s).", exc)

    yield
    logger.info("Biochar Carbon-Removal Pipeline – shutting down")


def create_app() -> FastAPI:
    application = FastAPI(
        title       = "Biochar Carbon-Removal Pipeline",
        description = "MRV API for biochar production, lab certification, and distribution attestation.",
        version     = "1.0.0",
        lifespan    = lifespan,
    )

    @application.middleware("http")
    async def add_process_time_header(request: Request, call_next):
        start    = time.perf_counter()
        response = await call_next(request)
        response.headers["X-Process-Time"] = f"{(time.perf_counter() - start) * 1_000:.1f}ms"
        return response

    application.add_middleware(
        CORSMiddleware,
        allow_origins     = _origins,
        allow_credentials = True,
        allow_methods     = ["*"],
        allow_headers     = ["*"],
    )

    from biochar.backend.routes import router as biochar_router
    application.include_router(biochar_router)

    @application.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
        if isinstance(exc, (StarletteHTTPException, RequestValidationError)):
            raise exc

        logger.error(
            "Unhandled exception on %s %s: %s",
            request.method, request.url.path, exc,
            exc_info=True,
        )
        return JSONResponse(
            status_code = status.HTTP_500_INTERNAL_SERVER_ERROR,
            content     = {
                "status":  "error",
                "code":    500,
                "message": "An unexpected error occurred.",
                "detail":  str(exc) if APP_ENV == "development" else None,
            },
        )

    @application.get("/health", tags=["Health"], operation_id="biochar_health_get")
    async def biochar_health() -> dict:
        return {"status": "ok", "service": "biochar"}

    # Serve biochar frontend static files
    frontend_dir = os.path.join(os.path.dirname(__file__), "frontend")
    if os.path.isdir(frontend_dir):
        application.mount("/", StaticFiles(directory=frontend_dir, html=True), name="biochar-frontend")

    return application


app = create_app()
