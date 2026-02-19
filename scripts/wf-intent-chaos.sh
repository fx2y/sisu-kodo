#!/usr/bin/env bash
set -euo pipefail

mkdir -p .tmp
log_worker1=".tmp/intent-chaos-worker-1.log"
log_worker2=".tmp/intent-chaos-worker-2.log"
log_shim=".tmp/intent-chaos-shim.log"
log_oc=".tmp/intent-chaos-oc.log"
app_port="${PORT:-3011}"
admin_port="${ADMIN_PORT:-3012}"
base_url="http://127.0.0.1:${app_port}"
app_version="chaos-v1"

stop_pid() {
  local pid="$1"
  if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
    kill "$pid" 2>/dev/null || true
    for _ in $(seq 1 20); do
      if ! kill -0 "$pid" 2>/dev/null; then
        break
      fi
      sleep 0.1
    done
    if kill -0 "$pid" 2>/dev/null; then
      kill -9 "$pid" 2>/dev/null || true
    fi
    wait "$pid" 2>/dev/null || true
  fi
}

cleanup() {
  stop_pid "${PID_WORKER1:-}"
  stop_pid "${PID_WORKER2:-}"
  stop_pid "${PID_SHIM:-}"
  stop_pid "${PID_OC:-}"
}
trap cleanup EXIT

pkill -f "src/worker/main.ts" 2>/dev/null || true
pkill -f "src/api-shim/main.ts" 2>/dev/null || true

echo "[intent-chaos] starting OC mock daemon..."
npx tsx scripts/oc-mock-daemon.ts 4096 >"$log_oc" 2>&1 &
PID_OC=$!

echo "[intent-chaos] starting API shim..."
PORT="$app_port" ADMIN_PORT="$admin_port" DBOS__APPVERSION="$app_version" OC_MODE="live" OC_BASE_URL="http://127.0.0.1:4096" npx tsx src/api-shim/main.ts >"$log_shim" 2>&1 &
PID_SHIM=$!

echo "[intent-chaos] starting worker #1..."
PORT="$app_port" ADMIN_PORT="$admin_port" CHAOS_SLEEP_EXECUTE=5000 DBOS__APPVERSION="$app_version" OC_MODE="live" OC_BASE_URL="http://127.0.0.1:4096" SBX_MODE="mock" npx tsx src/worker/main.ts >"$log_worker1" 2>&1 &
PID_WORKER1=$!

for _ in $(seq 1 80); do
  if curl -sf "${base_url}/healthz" >/dev/null; then
    break
  fi
  sleep 0.25
done

ready="0"
for _ in $(seq 1 80); do
  ready=$(scripts/db/psql-sys.sh -t -A -c \
    "SELECT 1 FROM information_schema.columns WHERE table_schema='dbos' AND table_name='workflow_status' AND column_name='queue_partition_key' LIMIT 1;" \
    | tr -d '\r' | xargs || true)
  if [ "$ready" = "1" ]; then
    break
  fi
  sleep 0.25
done
if [ "$ready" != "1" ]; then
  echo "ERROR: worker/system DB not ready after reset"
  exit 1
fi

echo "[intent-chaos] creating intent..."
intent_payload='{"goal":"chaos sleep 5","inputs":{},"constraints":{}}'
intent_res=$(curl -sf -X POST "${base_url}/intents" -H "Content-Type: application/json" -d "${intent_payload}")
intent_id=$(echo "$intent_res" | jq -r .intentId)
if [ -z "$intent_id" ] || [ "$intent_id" = "null" ]; then
  echo "ERROR: failed to create intent"
  exit 1
fi

echo "[intent-chaos] enqueueing run..."
run_payload='{"queueName":"intentQ","recipeName":"sandbox-default","workload":{"concurrency":2,"steps":3,"sandboxMinutes":2}}'
run_res=$(curl -sf -X POST "${base_url}/intents/${intent_id}/run" -H "Content-Type: application/json" -d "${run_payload}")
run_id=$(echo "$run_res" | jq -r .runId)
workflow_id=$(echo "$run_res" | jq -r .workflowId)
if [ -z "$run_id" ] || [ "$run_id" = "null" ]; then
  echo "ERROR: failed to enqueue run"
  exit 1
fi

echo "[intent-chaos] approving plan..."
approve_res=$(curl -sf -X POST "${base_url}/runs/${run_id}/approve-plan" \
  -H "Content-Type: application/json" \
  -d '{"approvedBy":"intent-chaos"}')
if [ "$(echo "$approve_res" | jq -r .accepted)" != "true" ]; then
  echo "ERROR: failed to approve plan for run ${run_id}"
  exit 1
fi

echo "[intent-chaos] waiting for execution to start..."
for _ in $(seq 1 40); do
  view="$(curl -sf "${base_url}/runs/${run_id}")"
  if echo "$view" | jq -e '.steps[] | select(.stepId=="DecideST")' >/dev/null 2>&1; then
    break
  fi
  sleep 0.25
done

# Wait a bit more for ExecuteST tasks to start sleeping
sleep 2

echo "[intent-chaos] killing worker #1 during executeTask sleep..."
kill -9 "$PID_WORKER1"
wait "$PID_WORKER1" 2>/dev/null || true

echo "[intent-chaos] starting worker #2..."
PORT="$app_port" ADMIN_PORT="$admin_port" DBOS__APPVERSION="$app_version" OC_MODE="live" OC_BASE_URL="http://127.0.0.1:4096" SBX_MODE="mock" npx tsx src/worker/main.ts >"$log_worker2" 2>&1 &
PID_WORKER2=$!

status="unknown"
echo "[intent-chaos] polling run status..."
for _ in $(seq 1 120); do
  status=$(curl -sf "${base_url}/runs/${run_id}" | jq -r .status)
  if [ "$status" = "succeeded" ]; then
    break
  fi
  if [ "$status" = "failed" ] || [ "$status" = "retries_exceeded" ]; then
    echo "ERROR: run reached terminal failure status: $status"
    exit 1
  fi
  sleep 0.5
done
if [ "$status" != "succeeded" ]; then
  echo "ERROR: timeout waiting for success"
  exit 1
fi

run_view=$(curl -sf "${base_url}/runs/${run_id}")

for step in CompileST ApplyPatchST DecideST; do
  attempt=$(echo "$run_view" | jq -r --arg step "$step" '.steps[] | select(.stepId==$step) | .output.attempt // empty')
  if [ "$attempt" != "1" ]; then
    echo "ERROR: expected ${step} attempt=1, got '${attempt:-missing}'"
    exit 1
  fi
done

if ! echo "$run_view" | jq -e '.steps[] | select(.stepId=="ExecuteST")' >/dev/null; then
  echo "ERROR: ExecuteST missing from run steps"
  exit 1
fi

echo "[intent-chaos] checking for duplicate receipts..."
dup_count=$(docker compose exec -T db psql -tA -U "${DB_USER:-postgres}" -d "${APP_DB_NAME:-app_local}" -c \
  "SELECT COUNT(*) FROM app.mock_receipts WHERE run_id = '${run_id}' AND seen_count > 1;" | tr -d '\r' | xargs)
if [ "${dup_count:-0}" != "0" ]; then
  echo "ERROR: duplicate receipts detected (${dup_count})"
  exit 1
fi

echo "[intent-chaos] checking SBX child run count..."
sbx_count=$(docker compose exec -T db psql -tA -U "${DB_USER:-postgres}" -d "${APP_DB_NAME:-app_local}" -c \
  "SELECT COUNT(*) FROM app.sbx_runs WHERE run_id = '${run_id}';" | tr -d '\r' | xargs)
if [ "${sbx_count:-0}" != "5" ]; then
  echo "ERROR: expected 5 SBX child runs, got '${sbx_count:-0}'"
  exit 1
fi

echo "[intent-chaos] OK workflow=${workflow_id} run=${run_id}"
