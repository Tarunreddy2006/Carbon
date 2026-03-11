from __future__ import annotations

import logging
import os
import sys
import time
from contextlib import asynccontextmanager
from typing import AsyncIterator

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException

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
from services.service import initialise_gee
from routes.estimate import router as estimate_router


# ─── Lifespan handler (startup / shutdown) ────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
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
        description = "Geospatial API estimating vegetation biomass, carbon, and CO₂.",
        version     = "1.0.0",
        lifespan    = lifespan,
    )

    @app.middleware("http")
    async def add_process_time_header(request: Request, call_next):
        start = time.perf_counter()
        response = await call_next(request)
        elapsed_ms = (time.perf_counter() - start) * 1_000
        response.headers["X-Process-Time"] = f"{elapsed_ms:.1f}ms"
        return response

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

    app.include_router(estimate_router)

    # ── K-GIS admin-hierarchy proxy endpoints ─────────────────────────────
    from starlette.concurrency import run_in_threadpool as _run_in_threadpool
    from services.lookup import (
        KGIS_BASE_URL, KGIS_DEPT_CODE, KGIS_APPLN_CODE,
        KGIS_TIMEOUT, _build_http_session, _normalise_hierarchy_response,
    )

    _proxy_session = _build_http_session()

    def _kgis_hierarchy(type_label: str, code: str):
        verify_ssl = os.getenv("KGIS_VERIFY_SSL", "true").lower() != "false"
        url    = f"{KGIS_BASE_URL.rstrip('/')}/kgisadminhierarchy"
        params = {
            "deptcode":  KGIS_DEPT_CODE,
            "applncode": KGIS_APPLN_CODE,
            "type":      type_label,
            "code":      code,
        }
        resp = _proxy_session.get(url, params=params,
                                  timeout=KGIS_TIMEOUT, verify=verify_ssl)
        resp.raise_for_status()

        try:
            raw = resp.json()
        except Exception as json_exc:
            raise ValueError("K-GIS returned non-JSON") from json_exc

        return _normalise_hierarchy_response(raw, context=f"{type_label} proxy")

    @app.get("/districts", tags=["K-GIS Proxy"])
    async def list_districts():
        try:
            return await _run_in_threadpool(_kgis_hierarchy, "District", "0")
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f"K-GIS error: {exc}")

    @app.get("/taluks/{district_code}", tags=["K-GIS Proxy"])
    async def list_taluks(district_code: str):
        try:
            return await _run_in_threadpool(_kgis_hierarchy, "Taluk", district_code)
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f"K-GIS error: {exc}")

    @app.get("/hoblis/{taluk_code}", tags=["K-GIS Proxy"])
    async def list_hoblis(taluk_code: str):
        try:
            return await _run_in_threadpool(_kgis_hierarchy, "Hobli", taluk_code)
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f"K-GIS error: {exc}")

    @app.get("/villages/{hobli_code}", tags=["K-GIS Proxy"])
    async def list_villages(hobli_code: str):
        try:
            return await _run_in_threadpool(_kgis_hierarchy, "Village", hobli_code)
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f"K-GIS error: {exc}")

    @app.get("/surveynumbers/{village_code}", tags=["K-GIS Proxy"])
    async def list_survey_numbers(village_code: str):
        try:
            verify_ssl = os.getenv("KGIS_VERIFY_SSL", "true").lower() != "false"
            url    = f"{KGIS_BASE_URL.rstrip('/')}/kgissurveynumber"
            params = {
                "deptcode":  KGIS_DEPT_CODE,
                "applncode": KGIS_APPLN_CODE,
                "villcode":  village_code,
            }

            def _fetch():
                r = _proxy_session.get(url, params=params,
                                       timeout=KGIS_TIMEOUT, verify=verify_ssl)
                r.raise_for_status()
                return _normalise_hierarchy_response(r.json(), context="surveynumbers proxy")

            return await _run_in_threadpool(_fetch)
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f"K-GIS error: {exc}")

    # ── Global exception handlers ─────────────────────────────────────────

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(
        request: Request, exc: Exception
    ) -> JSONResponse:
        
        # FIX: Do not swallow intentional API validation or routing errors!
        if isinstance(exc, (StarletteHTTPException, RequestValidationError)):
            raise exc

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

    @app.get("/health", tags=["Health"])
    async def health() -> dict:
        return {"status": "ok"}

    return app


app = create_app()