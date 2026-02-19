#!/usr/bin/env bash
set -euo pipefail

mkdir -p .tmp
log_worker=".tmp/sandbox-fanout-worker.log"
log_shim=".tmp/sandbox-fanout-shim.log"
log_oc=".tmp/sandbox-fanout-oc.log"
mock_log="oc-mock-soak.log"
base_url="http://127.0.0.1:${PORT:-3001}"
oc_port=4296
app_version="sandbox-fanout-v1"

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
  stop_pid "${PID_WORKER:-}"
  stop_pid "${PID_SHIM:-}"
  stop_pid "${PID_OC:-}"
}
trap cleanup EXIT

pkill -f "scripts/oc-mock-daemon.ts" 2>/dev/null || true
rm -f "$mock_log"

echo "[sandbox-fanout] starting OC mock on $oc_port..."
OC_MOCK_LOG="$mock_log" pnpm exec tsx scripts/oc-mock-daemon.ts $oc_port >"$log_oc" 2>&1 &
PID_OC=$!

# Wait for OC mock to be ready
for _ in $(seq 1 40); do
  if curl -sf "http://127.0.0.1:$oc_port/global/health" >/dev/null; then
    break
  fi
  sleep 0.25
done

# PUSH RESPONSES TO MOCK
echo "[sandbox-fanout] pushing mock responses..."
PLAN_RESP='{"info":{"id":"msg-plan-soak","structured_output":{"goal":"fanout 100 tasks","design":["design"],"files":["file.ts"],"risks":["none"],"tests":["test0.ts"]},"tool_calls":[]},"messages":[],"usage":{"total_tokens":100}}'
BUILD_RESP="{\"info\":{\"id\":\"msg-build-soak\",\"structured_output\":{\"patch\":[],\"tests\":$(node -e 'console.log(JSON.stringify(Array.from({length:100}, (_, i) => `test${i}.ts`)))'),\"test_command\":\"echo running\"},\"tool_calls\":[]},\"messages\":[],\"usage\":{\"total_tokens\":100}}"

curl -sf -X POST "http://127.0.0.1:$oc_port/push-agent-response" -H "Content-Type: application/json" -d "{\"agent\":\"plan\", \"response\": $PLAN_RESP}"
curl -sf -X POST "http://127.0.0.1:$oc_port/push-agent-response" -H "Content-Type: application/json" -d "{\"agent\":\"build\", \"response\": $BUILD_RESP}"

echo "[sandbox-fanout] starting worker..."
ADMIN_PORT=3003 OC_BASE_URL="http://127.0.0.1:$oc_port" OC_MODE="live" DBOS__APPVERSION="$app_version" node dist/worker/main.js >"$log_worker" 2>&1 &
PID_WORKER=$!

echo "[sandbox-fanout] waiting for worker to launch..."
for _ in $(seq 1 120); do
  if grep -q "DBOS worker launched" "$log_worker"; then
    break
  fi
  sleep 0.25
done

echo "[sandbox-fanout] starting API shim..."
ADMIN_PORT=3004 OC_BASE_URL="http://127.0.0.1:$oc_port" OC_MODE="live" DBOS__APPVERSION="$app_version" node dist/api-shim/main.js >"$log_shim" 2>&1 &
PID_SHIM=$!

for _ in $(seq 1 80); do
  if curl -sf "${base_url}/healthz" >/dev/null; then
    break
  fi
  sleep 0.25
done

echo "[sandbox-fanout] enqueueing 1 intent with 100 tasks fanout..."
intent_res=$(curl -sf -X POST "${base_url}/intents" \
  -H "Content-Type: application/json" \
  -d "{\"goal\":\"fanout 100 tasks\",\"inputs\":{},\"constraints\":{}}")
intent_id=$(echo "$intent_res" | jq -r .intentId)

run_res=$(curl -sf -X POST "${base_url}/intents/${intent_id}/run" \
  -H "Content-Type: application/json" \
  -d '{"queueName":"intentQ","queuePartitionKey":"soak-partition","recipeName":"sandbox-default","workload":{"concurrency":10,"steps":1,"sandboxMinutes":5}}')
run_id=$(echo "$run_res" | jq -r .runId)

echo "[sandbox-fanout] waiting for status=waiting_input..."
for _ in $(seq 1 60); do
  status=$(curl -sf "${base_url}/runs/${run_id}" | jq -r .status)
  if [ "$status" = "waiting_input" ]; then
    break
  fi
  sleep 0.5
done

echo "[sandbox-fanout] approving plan..."
approve_res=$(curl -sf -X POST "${base_url}/runs/${run_id}/approve-plan" \
  -H "Content-Type: application/json" \
  -d '{"approvedBy":"sandbox-soak"}')

echo "[sandbox-fanout] wait for partial progress..."
# We expect 100 tasks. Let's wait until at least 10 tasks are in sbx_runs
for _ in $(seq 1 40); do
  count=$(docker compose exec -T db psql -tA -U "${DB_USER:-postgres}" -d "${APP_DB_NAME:-app_local}" -c \
    "SELECT COUNT(*) FROM app.sbx_runs WHERE run_id = '$run_id';" | tr -d '\r' | xargs || echo 0)
  if [ "${count:-0}" -ge 10 ]; then
    echo "[sandbox-fanout] partial progress: ${count}/100 tasks completed."
    break
  fi
  sleep 0.5
done

echo "[sandbox-fanout] KILLING WORKER MID-BATCH..."
stop_pid "$PID_WORKER"

echo "[sandbox-fanout] RESTARTING WORKER..."
ADMIN_PORT=3003 OC_BASE_URL="http://127.0.0.1:$oc_port" OC_MODE="live" DBOS__APPVERSION="$app_version" node dist/worker/main.js >>"$log_worker" 2>&1 &
PID_WORKER=$!

echo "[sandbox-fanout] waiting for completion..."
for tick in $(seq 1 120); do
  status=$(curl -sf "${base_url}/runs/${run_id}" | jq -r .status)
  if [ "$status" = "succeeded" ]; then
    echo "[sandbox-fanout] run succeeded!"
    break
  fi
  if [ "$status" = "failed" ] || [ "$status" = "retries_exceeded" ]; then
    echo "ERROR: run failed with status ${status}"
    exit 1
  fi
  if [ $((tick % 10)) -eq 0 ]; then
    echo "[sandbox-fanout] waiting... status=${status}"
  fi
  sleep 1
done

final_status=$(curl -sf "${base_url}/runs/${run_id}" | jq -r .status)
if [ "$final_status" != "succeeded" ]; then
  echo "ERROR: timeout waiting for run to succeed"
  exit 1
fi

task_count=$(docker compose exec -T db psql -tA -U "${DB_USER:-postgres}" -d "${APP_DB_NAME:-app_local}" -c \
  "SELECT COUNT(*) FROM app.sbx_runs WHERE run_id = '$run_id';" | tr -d '\r' | xargs)
echo "[sandbox-fanout] completed tasks: ${task_count}"
if [ "${task_count:-0}" -lt 100 ]; then
  echo "ERROR: missing tasks in sbx_runs (${task_count}/100)"
  exit 1
fi

echo "[sandbox-fanout] OK"
