#!/usr/bin/env bash
set -euo pipefail

mkdir -p .tmp
wf_id="wf_crashdemo_$(date +%s%N | head -c 20)_$RANDOM"
log1=".tmp/wf-crashdemo-1.log"
log2=".tmp/wf-crashdemo-2.log"

cleanup() {
  if [ -n "${PID1:-}" ] && kill -0 "$PID1" 2>/dev/null; then
    kill "$PID1" 2>/dev/null || true
  fi
  if [ -n "${PID2:-}" ] && kill -0 "$PID2" 2>/dev/null; then
    kill "$PID2" 2>/dev/null || true
  fi
}
trap cleanup EXIT

node dist/main.js >"$log1" 2>&1 &
PID1=$!

for _ in $(seq 1 40); do
  if curl -sf "http://127.0.0.1:${PORT:-3001}/healthz" >/dev/null; then
    break
  fi
  sleep 0.25
done

curl -sf -X POST "http://127.0.0.1:${PORT:-3001}/crashdemo?wf=${wf_id}" >/dev/null
sleep 1
kill -9 "$PID1"
wait "$PID1" 2>/dev/null || true

node dist/main.js >"$log2" 2>&1 &
PID2=$!
for _ in $(seq 1 40); do
  if curl -sf "http://127.0.0.1:${PORT:-3001}/healthz" >/dev/null; then
    break
  fi
  sleep 0.25
done

pnpm exec tsx scripts/assert-marks.ts "$wf_id"

echo "Verifying DBOS CLI visibility..."
status=$(scripts/db/psql-sys.sh -t -A -c "SELECT status FROM dbos.workflow_status WHERE workflow_uuid = '$wf_id'" | xargs)
echo "DBOS workflow status: $status"
if [ "$status" != "SUCCESS" ]; then
  echo "ERROR: Expected SUCCESS status, got '$status'"
  exit 1
fi
echo "DBOS visibility: OK"
