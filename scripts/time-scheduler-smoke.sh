#!/usr/bin/env bash
set -euo pipefail

mkdir -p .tmp
app_port="${PORT:-3017}"
admin_port="${ADMIN_PORT:-3018}"
base_url="http://127.0.0.1:${app_port}"
app_version="time-scheduler-${$}"
log=".tmp/time-scheduler-smoke.log"

cleanup() {
  if [ -n "${PID:-}" ] && kill -0 "$PID" 2>/dev/null; then
    kill "$PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

echo "[Smoke] Starting worker..."
PORT="$app_port" ADMIN_PORT="$admin_port" DBOS__APPVERSION="$app_version" node dist/main.js >"$log" 2>&1 &
PID=$!

# Wait for healthz
for _ in $(seq 1 40); do
  if curl -sf "${base_url}/healthz" >/dev/null; then
    break
  fi
  sleep 0.25
done

# Reset ticks to start from 0
scripts/db/psql-app.sh -c "DELETE FROM app.artifacts WHERE step_id = 'ScheduledTick'" >/dev/null

echo "[Smoke] Waiting 35s for scheduler tick..."
sleep 35

echo "[Smoke] Checking for tick artifact..."
count=$(scripts/db/psql-app.sh -t -A -c "SELECT count(*) FROM app.artifacts WHERE step_id = 'ScheduledTick'" | xargs)
echo "[Smoke] Tick count: $count"

if [ "$count" -eq 0 ]; then
  # Retry once if we just missed the interval
  echo "[Smoke] No tick yet, waiting another 10s..."
  sleep 10
  count=$(scripts/db/psql-app.sh -t -A -c "SELECT count(*) FROM app.artifacts WHERE step_id = 'ScheduledTick'" | xargs)
  echo "[Smoke] Tick count: $count"
fi

if [ "$count" -eq 0 ]; then
  echo "ERROR: No scheduler tick found after 45s"
  exit 1
fi

echo "[Smoke] Scheduler tick: OK"
