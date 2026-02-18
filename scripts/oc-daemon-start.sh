#!/usr/bin/env bash
set -euo pipefail

PORT="${OC_SERVER_PORT:-4096}"
HOST="${OC_SERVER_HOST:-127.0.0.1}"
CORS_ORIGIN="${OC_SERVER_CORS:-http://localhost:3000}"
PID_FILE=".tmp/oc-daemon-${PORT}.pid"
LOG_FILE=".tmp/oc-daemon-${PORT}.log"

mkdir -p .tmp
if [ -f "$PID_FILE" ]; then
  PID=$(cat "$PID_FILE")
  if ps -p "$PID" >/dev/null 2>&1; then
    echo "OC Daemon already running at $PID"
    exit 0
  fi
fi

# S.OC.DAEMON.SERVE
if command -v opencode >/dev/null 2>&1; then
  opencode serve --hostname "$HOST" --port "$PORT" --cors "$CORS_ORIGIN" >"$LOG_FILE" 2>&1 &
else
  if [ "${OC_STRICT_MODE:-0}" = "1" ]; then
    echo "ERROR: opencode binary not found and OC_STRICT_MODE=1. Cannot start real-integration daemon."
    exit 1
  fi
  echo "opencode binary not found, falling back to mock daemon..."
  OC_SERVER_PORT="$PORT" pnpm exec tsx scripts/oc-mock-daemon.ts >"$LOG_FILE" 2>&1 &
fi
echo $! >"$PID_FILE"
echo "OC Daemon started at $(cat "$PID_FILE") (port=$PORT)"
