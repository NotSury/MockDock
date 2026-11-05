#!/usr/bin/env bash
# Start the FastAPI backend (with auto-reload) and the Vite dev server together.
# Ctrl+C stops both.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -x backend/.venv/bin/python ]; then
  echo "Python venv missing — run 'make install' first." >&2
  exit 1
fi
if [ ! -d frontend/node_modules ]; then
  echo "Frontend dependencies missing — run 'make install' first." >&2
  exit 1
fi

cleanup() { kill 0 2>/dev/null || true; }
trap cleanup EXIT INT TERM

(cd backend && .venv/bin/python -m uvicorn app.main:create_app --factory \
    --host "${MOCKDOCK_HOST:-127.0.0.1}" --port "${MOCKDOCK_PORT:-8000}" --reload --reload-dir app) &
(cd frontend && npm run dev) &

echo ""
echo "  MockDock UI      -> http://127.0.0.1:5173"
echo "  Mock server/API  -> http://127.0.0.1:${MOCKDOCK_PORT:-8000}  (docs at /api/docs)"
echo ""
wait
