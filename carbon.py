from __future__ import annotations

import logging
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

from core.config import settings
from database.db import engine, Base
from services.service import initialise_gee

logging.basicConfig(
    stream  = sys.stdout,
    level   = getattr(logging, settings.LOG_LEVEL, logging.INFO),
    format  = "%(asctime)s  %(levelname)-8s  %(name)s – %(message)s",
    datefmt = "%Y-%m-%dT%H:%M:%S",
)
logger = logging.getLogger("carbon_engine")

@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    logger.info("═══════════════════════════════════════════════════════")
    logger.info("  Carbon Biomass Intelligence Engine – starting up")
    logger.info("  ENV: %s", settings.APP_ENV)
    logger.info("═══════════════════════════════════════════════════════")

    try: 
        logger.info("Initialising Geospatial Database...")
        Base.metadata.create_all(bind=engine)
    except Exception as exc:
        logger.error("❌  Failed to initialise Geospatial Database (%s).", exc)
        
    try:
        initialise_gee()
        logger.info("✔  Google Earth Engine authenticated and ready")
    except Exception as exc:
        logger.warning("⚠  GEE failed at startup (%s). /demo still available.", exc)
        
    yield
    logger.info("Carbon Biomass Intelligence Engine – shutting down")

def create_app() -> FastAPI:
    app = FastAPI(
        title       = "Carbon Biomass Intelligence Engine",
        description = "Geospatial API estimating vegetation biomass, carbon, and CO₂.",
        version     = "1.0.0",
        lifespan    = lifespan,
    )

    @app.middleware("http")
    async def add_process_time_header(request: Request, call_next):
        start    = time.perf_counter()
        response = await call_next(request)
        response.headers["X-Process-Time"] = f"{(time.perf_counter() - start) * 1_000:.1f}ms"
        return response

    origins = [o.strip() for o in settings.CORS_ORIGINS.split(",") if o.strip()]
    app.add_middleware(
        CORSMiddleware,
        allow_origins     = origins,
        allow_credentials = True,
        allow_methods     = ["*"],
        allow_headers     = ["*"],
    )

    from routes import estimate, verify, auth, billing, certificate

    app.include_router(auth.router)
    app.include_router(estimate.router)
    app.include_router(verify.router)
    app.include_router(billing.router)
    app.include_router(certificate.router)

    @app.exception_handler(Exception)
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
                "detail":  str(exc) if settings.APP_ENV == "development" else None,
            },
        )

    @app.get("/health", tags=["Health"], operation_id="app_health_get")
    async def app_health() -> dict:
        return {"status": "ok"}
        
    app.mount("/", StaticFiles(directory="frontend", html=True), name="frontend")

    return app

app = create_app()