#!/usr/bin/env bash
set -euo pipefail

mkdir -p .tmp
log_worker1=".tmp/ui-durability-worker-1.log"
log_worker2=".tmp/ui-durability-worker-2.log"
log_shim=".tmp/ui-durability-shim.log"
log_oc=".tmp/ui-durability-oc.log"
app_port="${PORT:-3013}"
admin_port="${ADMIN_PORT:-3014}"
base_url="http://127.0.0.1:${app_port}"
app_version="durability-v1-$$"

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

echo "[ui-durability] starting OC mock daemon on port 4097..."
npx tsx scripts/oc-mock-daemon.ts 4097 >"$log_oc" 2>&1 &
PID_OC=$!

echo "[ui-durability] starting API shim on port $app_port..."
PORT="$app_port" ADMIN_PORT="$admin_port" DBOS__APPVERSION="$app_version" OC_MODE="live" OC_BASE_URL="http://127.0.0.1:4097" npx tsx src/api-shim/main.ts >"$log_shim" 2>&1 &
PID_SHIM=$!

echo "[ui-durability] starting worker #1..."
PORT="$app_port" ADMIN_PORT="$admin_port" CHAOS_SLEEP_EXECUTE=5000 DBOS__APPVERSION="$app_version" OC_MODE="live" OC_BASE_URL="http://127.0.0.1:4097" SBX_MODE="mock" npx tsx src/worker/main.ts >"$log_worker1" 2>&1 &
PID_WORKER1=$!

# Wait for healthy
for _ in $(seq 1 80); do
  if curl -s "${base_url}/healthz" >/dev/null; then
    break
  fi
  sleep 0.25
done

echo "[ui-durability] creating intent via /api/intents..."
intent_payload='{"goal":"durability test","inputs":{},"constraints":{}}'
intent_res=$(curl -s -X POST "${base_url}/api/intents" -H "Content-Type: application/json" -d "${intent_payload}")
echo "Intent response: $intent_res"
intent_id=$(echo "$intent_res" | jq -r .intentId)

echo "[ui-durability] starting run via /api/runs..."
run_payload="{\"intentId\":\"${intent_id}\",\"recipeName\":\"sandbox-default\",\"queuePartitionKey\":\"durability-partition\",\"workload\":{\"concurrency\":1,\"steps\":2,\"sandboxMinutes\":1}}"
run_res=$(curl -s -f -X POST "${base_url}/api/runs" -H "Content-Type: application/json" -d "${run_payload}")
if [ $? -ne 0 ]; then
  echo "ERROR: curl failed to start run"
  exit 1
fi
echo "Run response: $run_res"
workflow_id=$(echo "$run_res" | jq -r .workflowID)

if [ -z "$workflow_id" ] || [ "$workflow_id" = "null" ]; then
  echo "ERROR: failed to extract workflowID from response"
  exit 1
fi

echo "[ui-durability] waiting for waiting_input status..."
for _ in $(seq 1 40); do
  status_raw=$(curl -s "${base_url}/api/runs/${workflow_id}" || echo "")
  echo "Current status response: $status_raw"
  if [ -n "$status_raw" ]; then
    status=$(echo "$status_raw" | jq -r .status 2>/dev/null || echo "parse_error")
    next_action=$(echo "$status_raw" | jq -r .nextAction 2>/dev/null || echo "null")
    if [ "$status" = "PENDING" ] && [ "$next_action" = "APPROVE_PLAN" ]; then
      break
    fi
  fi
  sleep 1
done

echo "[ui-durability] approving plan via /api endpoint (HITL)..."
curl -s -X POST "${base_url}/api/runs/${workflow_id}/approve-plan" \
  -H "Content-Type: application/json" \
  -d '{"approvedBy":"ui-durability"}'

echo "[ui-durability] waiting for DecideST to complete..."
for _ in $(seq 1 40); do
  steps_raw=$(curl -s -f "${base_url}/api/runs/${workflow_id}/steps" || echo "")
  if [ -n "$steps_raw" ] && echo "$steps_raw" | jq -e '.[] | select(.stepID=="DecideST")' >/dev/null 2>&1; then
    break
  fi
  sleep 0.5
done

sleep 2
echo "[ui-durability] killing worker #1 during ExecuteST..."
kill -9 "$PID_WORKER1"
wait "$PID_WORKER1" 2>/dev/null || true

echo "[ui-durability] starting worker #2..."
PORT="$app_port" ADMIN_PORT="$((admin_port + 10))" DBOS__APPVERSION="$app_version" OC_MODE="live" OC_BASE_URL="http://127.0.0.1:4097" SBX_MODE="mock" npx tsx src/worker/main.ts >"$log_worker2" 2>&1 &
PID_WORKER2=$!

echo "[ui-durability] polling /api/runs/${workflow_id} for SUCCESS..."
status="unknown"
for _ in $(seq 1 60); do
  status_raw=$(curl -s -f "${base_url}/api/runs/${workflow_id}" || echo "")
  if [ -n "$status_raw" ]; then
    status=$(echo "$status_raw" | jq -r .status)
    if [ "$status" = "SUCCESS" ]; then
      break
    fi
    if [ "$status" = "ERROR" ]; then
      echo "ERROR: run failed"
      exit 1
    fi
  fi
  sleep 1
done

if [ "$status" != "SUCCESS" ]; then
  echo "ERROR: timeout waiting for SUCCESS, current status: $status"
  exit 1
fi

echo "[ui-durability] verifying artifact counts (C4.T2)..."
steps_json=$(curl -s -f "${base_url}/api/runs/${workflow_id}/steps")
if [ $? -ne 0 ] || [ -z "$steps_json" ]; then
  echo "ERROR: failed to fetch steps for verification"
  exit 1
fi

# Verify CompileST has 'none' artifact
compile_art_count=$(echo "$steps_json" | jq '.[] | select(.stepID=="CompileST") | .artifactRefs | length')
if [ "$compile_art_count" = "null" ] || [ "$compile_art_count" -lt 1 ]; then
  echo "ERROR: CompileST should have at least 1 artifact (none sentinel), got $compile_art_count"
  exit 1
fi

# Verify ExecuteST has multiple artifacts
execute_art_count=$(echo "$steps_json" | jq '.[] | select(.stepID=="ExecuteST") | .artifactRefs | length')
if [ "$execute_art_count" = "null" ] || [ "$execute_art_count" -lt 5 ]; then
  echo "ERROR: ExecuteST should have multiple artifacts, got $execute_art_count"
  exit 1
fi

echo "[ui-durability] OK workflow=${workflow_id} verified via /api"
