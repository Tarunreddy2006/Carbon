import multiprocessing
import os

# ── Workers ───────────────────────────────────────────────────────────────────
# Recommended formula: (2 × CPU cores) + 1
# GEE calls are blocking I/O offloaded to a thread pool, so CPU-bound formula
# is appropriate; increase only if you have many concurrent users.
workers = int(os.getenv("GUNICORN_WORKERS", multiprocessing.cpu_count() * 2 + 1))

# Each Gunicorn worker runs a UvicornWorker, which is an async ASGI server.
# This gives us both multiprocessing (Gunicorn) and async concurrency (uvicorn).
worker_class = "uvicorn.workers.UvicornWorker"

# Threads per worker — uvicorn workers handle concurrency internally via asyncio;
# keep this at 1 to avoid double-threading issues.
threads = 1

# ── Network ───────────────────────────────────────────────────────────────────
bind = os.getenv("GUNICORN_BIND", "0.0.0.0:8000")

# ── Timeouts ──────────────────────────────────────────────────────────────────
# GEE calls can take 30–90 s for large parcels; set timeout generously.
# Requests that exceed this are killed and a 502 is returned.
timeout       = int(os.getenv("GUNICORN_TIMEOUT",        "120"))  # seconds
keepalive     = int(os.getenv("GUNICORN_KEEPALIVE",      "5"))    # seconds
graceful_timeout = int(os.getenv("GUNICORN_GRACEFUL",    "30"))   # seconds

# ── Logging ───────────────────────────────────────────────────────────────────
# Write both access and error logs to stdout so container runtimes capture them.
accesslog  = "-"
errorlog   = "-"
loglevel   = os.getenv("LOG_LEVEL", "info").lower()

# Log format: timestamp, status, method, URL, duration, response size
access_log_format = '%(t)s  %(s)s  %(m)s %(U)s  %(D)sµs  %(b)s bytes  %(h)s'

# ── Process management ────────────────────────────────────────────────────────
# Let Kubernetes / Docker handle process management; no pidfile needed.
daemon       = False
preload_app  = True    # Load the application before forking workers.
                       # This lets GEE authenticate ONCE in the master process
                       # and workers inherit the authenticated state via fork.

# ── Security ──────────────────────────────────────────────────────────────────
# Limit request line and header sizes to prevent abuse.
limit_request_line        = 4094    # bytes
limit_request_fields      = 100
limit_request_field_size  = 8190   # bytes

# ── Worker lifecycle hooks ────────────────────────────────────────────────────

def on_starting(server):
    """Called just before the master process is initialised."""
    server.log.info("═══════════════════════════════════════════════════")
    server.log.info("  Carbon Biomass Intelligence Engine — Gunicorn")
    server.log.info("  workers=%d  timeout=%ds  bind=%s", workers, timeout, bind)
    server.log.info("═══════════════════════════════════════════════════")


def worker_int(worker):
    """Called just after a worker exited on SIGINT or SIGQUIT."""
    worker.log.info("Worker %s interrupted", worker.pid)


def worker_abort(worker):
    """Called when a worker received the SIGABRT signal (timeout)."""
    worker.log.warning("Worker %s timed out and was aborted", worker.pid)
