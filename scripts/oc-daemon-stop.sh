#!/usr/bin/env bash
set -euo pipefail

PORT="${OC_SERVER_PORT:-4096}"
PID_FILE=".tmp/oc-daemon-${PORT}.pid"

if [ -f "$PID_FILE" ]; then
  PID=$(cat "$PID_FILE")
  kill "$PID" || true
  rm -f "$PID_FILE"
  echo "OC Daemon stopped"
else
  # Fallback: kill by port if pid file missing
  PID=$(lsof -t -i:"${PORT}" || true)
  if [ -n "$PID" ]; then
    kill "$PID" || true
    echo "OC Daemon stopped (killed by port)"
  else
    echo "OC Daemon not running"
  fi
fi
