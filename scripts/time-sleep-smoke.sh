#!/usr/bin/env bash
set -euo pipefail

mkdir -p .tmp
app_port="${PORT:-3015}"
admin_port="${ADMIN_PORT:-3016}"
base_url="http://127.0.0.1:${app_port}"
app_version="time-sleep-${$}"
wf_id="sleep_smoke_${$}"
log1=".tmp/time-sleep-smoke-1.log"
log2=".tmp/time-sleep-smoke-2.log"

cleanup() {
  if [ -n "${PID1:-}" ] && kill -0 "$PID1" 2>/dev/null; then
    kill "$PID1" 2>/dev/null || true
  fi
  if [ -n "${PID2:-}" ] && kill -0 "$PID2" 2>/dev/null; then
    kill "$PID2" 2>/dev/null || true
  fi
}
trap cleanup EXIT

echo "[Smoke] Starting worker (1)..."
PORT="$app_port" ADMIN_PORT="$admin_port" DBOS__APPVERSION="$app_version" node dist/main.js >"$log1" 2>&1 &
PID1=$!

# Wait for healthz
for _ in $(seq 1 40); do
  if curl -sf "${base_url}/healthz" >/dev/null; then
    break
  fi
  sleep 0.25
done

echo "[Smoke] Creating dummy run for ${wf_id}..."
scripts/db/psql-app.sh -c "INSERT INTO app.intents (id, goal, payload) VALUES ('${wf_id}', 'Sleep Smoke', '{}') ON CONFLICT DO NOTHING" >/dev/null
scripts/db/psql-app.sh -c "INSERT INTO app.runs (id, intent_id, workflow_id, status) VALUES ('${wf_id}', '${wf_id}', '${wf_id}', 'PENDING') ON CONFLICT DO NOTHING" >/dev/null

echo "[Smoke] Triggering sleep workflow (2s sleep)..."
curl -sf -X POST "${base_url}/api/ops/sleep?wf=${wf_id}&sleep=2000" >/dev/null

echo "[Smoke] Waiting for 'before-sleep' artifact..."
for _ in $(seq 1 20); do
  count=$(scripts/db/psql-app.sh -t -A -c "SELECT count(*) FROM app.artifacts WHERE run_id = '${wf_id}' AND step_id = 'sleep-before-sleep'" | xargs)
  if [ "$count" -gt 0 ]; then
    break
  fi
  sleep 0.25
done

if [ "$count" -eq 0 ]; then
  echo "ERROR: 'before-sleep' artifact not found"
  exit 1
fi

echo "[Smoke] Crashing worker (1)..."
kill -9 "$PID1"
wait "$PID1" 2>/dev/null || true

echo "[Smoke] Starting worker (2)..."
PORT="$app_port" ADMIN_PORT="$((admin_port + 10))" DBOS__APPVERSION="$app_version" node dist/main.js >"$log2" 2>&1 &
PID2=$!

for _ in $(seq 1 40); do
  if curl -sf "${base_url}/healthz" >/dev/null; then
    break
  fi
  sleep 0.25
done

echo "[Smoke] Waiting for 'after-sleep' artifact..."
for _ in $(seq 1 40); do
  count=$(scripts/db/psql-app.sh -t -A -c "SELECT count(*) FROM app.artifacts WHERE run_id = '${wf_id}' AND step_id = 'sleep-after-sleep'" | xargs)
  if [ "$count" -gt 0 ]; then
    break
  fi
  sleep 0.5
done

if [ "$count" -eq 0 ]; then
  echo "ERROR: 'after-sleep' artifact not found after restart"
  exit 1
fi

echo "[Smoke] Sleep durability: OK"
