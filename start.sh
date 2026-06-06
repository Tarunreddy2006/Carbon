set -euo pipefail

# ── Resolve project root ──────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ── Load .env if present ──────────────────────────────────────────────────────
if [[ -f ".env" ]]; then
    set -o allexport
    # shellcheck source=/dev/null
    source .env
    set +o allexport
    echo "[start.sh] .env loaded"
else
    echo "[start.sh] WARNING: no .env file found — using environment variables only"
fi

# ── Defaults ──────────────────────────────────────────────────────────────────
HOST="${HOST:-0.0.0.0}"
PORT="${PORT:-8000}"
WORKERS="${GUNICORN_WORKERS:-2}"
TIMEOUT="${GUNICORN_TIMEOUT:-120}"
MODE="${1:-prod}"

echo "[start.sh] mode=$MODE  host=$HOST  port=$PORT"

# ── Choose launcher ───────────────────────────────────────────────────────────
if [[ "$MODE" == "dev" ]]; then
echo "[start.sh] Starting uvicorn in development mode (auto-reload)"
    exec uvicorn carbon:app \
        --host "$HOST" \
        --port "$PORT" \
        --reload \
        --log-level "${LOG_LEVEL:-info}"

else
    echo "[start.sh] Starting gunicorn with $WORKERS uvicorn workers"
    exec gunicorn carbon:app \
        --worker-class uvicorn.workers.UvicornWorker \
        --workers "$WORKERS" \
        --bind "${HOST}:${PORT}" \
        --timeout "$TIMEOUT" \
        --access-logfile - \
        --error-logfile - \
        --log-level "${LOG_LEVEL:-info}"
fi
