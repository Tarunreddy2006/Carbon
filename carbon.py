from __future__ import annotations

import logging
import os
import sys
import time
from contextlib import asynccontextmanager
from typing import AsyncIterator
from database.db import engine, Base
from database import models
from dotenv import load_dotenv
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
from routes.estimate import router as estimate_router
from routes import verify

load_dotenv()

LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()
logging.basicConfig(
    stream  = sys.stdout,
    level   = getattr(logging, LOG_LEVEL, logging.INFO),
    format  = "%(asctime)s  %(levelname)-8s  %(name)s – %(message)s",
    datefmt = "%Y-%m-%dT%H:%M:%S",
)
logger = logging.getLogger("carbon_engine")

from services.service import initialise_gee


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    logger.info("═══════════════════════════════════════════════════════")
    logger.info("  Carbon Biomass Intelligence Engine – starting up")
    logger.info("  ENV: %s", os.getenv("APP_ENV", "development"))
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

    # ── Middleware ────────────────────────────────────────────────────────
    # IMPORTANT: Starlette builds the middleware stack in LIFO order.
    # Whichever middleware is registered LAST ends up OUTERMOST, meaning it
    # handles every request and response first.
    #
    # @app.middleware("http") is registered first  → ends up inner
    # add_middleware(CORS)    is registered second → ends up outermost
    #
    # CORSMiddleware MUST be outermost so that:
    #   • OPTIONS preflight requests are handled before any route logic runs
    #   • CORS headers are attached to every response, including error responses
    # If CORS is inner, preflight requests that hit an unregistered route get a
    # 400/404 with no Access-Control-Allow-Origin header → browser blocks them.

    @app.middleware("http")
    async def add_process_time_header(request: Request, call_next):
        start    = time.perf_counter()
        response = await call_next(request)
        response.headers["X-Process-Time"] = f"{(time.perf_counter() - start) * 1_000:.1f}ms"
        return response

    # Registered LAST → outermost → handles every request before anything else.
    raw_origins = os.getenv(
        "CORS_ORIGINS",
        "http://localhost:3000,http://127.0.0.1:5500,http://localhost:5500",
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
    # routes/location.py owns ALL K-GIS proxy endpoints:
    #   GET /districts
    #   GET /taluks/{district_code}
    #   GET /hoblis/{taluk_code}
    #   GET /villages/{hobli_code}
    #   GET /surveynumbers/{village_code}
    #
    # Do NOT define these routes again inline — FastAPI uses first-match-wins
    # routing, so any duplicate definition here would be dead code and would
    # cause confusion when tracing bugs
    # Inside your main.py
    from routes import estimate, verify, auth

# ... your app initialization ...

    app.include_router(auth.router)
    app.include_router(estimate.router)
    app.include_router(verify.router)
    from database.db import engine, Base
    Base.metadata.create_all(bind=engine)
    # ── Global exception handler ──────────────────────────────────────────
    @app.exception_handler(Exception)
    async def unhandled_exception_handler(
        request: Request, exc: Exception
    ) -> JSONResponse:
        # Do not swallow intentional HTTP or validation errors.
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
                "detail":  str(exc) if os.getenv("APP_ENV") == "development" else None,
            },
        )

    @app.get("/health", tags=["Health"], operation_id="app_health_get")
    async def app_health() -> dict:
        return {"status": "ok"}
    app.mount("/", StaticFiles(directory="frontend", html=True), name="frontend")

    return app

app = create_app()