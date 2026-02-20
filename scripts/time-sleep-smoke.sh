#!/usr/bin/env bash
set -euo pipefail

mkdir -p .tmp
wf_id="sleep_smoke_$(date +%s%N | head -c 20)_$RANDOM"
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
node dist/main.js >"$log1" 2>&1 &
PID1=$!

# Wait for healthz
for _ in $(seq 1 40); do
  if curl -sf "http://127.0.0.1:${PORT:-3001}/healthz" >/dev/null; then
    break
  fi
  sleep 0.25
done

echo "[Smoke] Creating dummy run for ${wf_id}..."
scripts/db/psql-app.sh -c "INSERT INTO app.intents (id, goal, payload) VALUES ('${wf_id}', 'Sleep Smoke', '{}') ON CONFLICT DO NOTHING" >/dev/null
scripts/db/psql-app.sh -c "INSERT INTO app.runs (id, intent_id, workflow_id, status) VALUES ('${wf_id}', '${wf_id}', '${wf_id}', 'PENDING') ON CONFLICT DO NOTHING" >/dev/null

echo "[Smoke] Triggering sleep workflow (2s sleep)..."
curl -sf -X POST "http://127.0.0.1:${PORT:-3001}/api/ops/wf/sleep?wf=${wf_id}&sleep=2000" >/dev/null

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
node dist/main.js >"$log2" 2>&1 &
PID2=$!

for _ in $(seq 1 40); do
  if curl -sf "http://127.0.0.1:${PORT:-3001}/healthz" >/dev/null; then
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
