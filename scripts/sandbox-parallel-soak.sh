#!/usr/bin/env bash
set -euo pipefail

mkdir -p .tmp
log_worker=".tmp/sandbox-soak-worker.log"
log_shim=".tmp/sandbox-soak-shim.log"
base_url="http://127.0.0.1:${PORT:-3001}"
app_version="sandbox-soak-v1"
total=100
run_ids_file=".tmp/sandbox-soak-run-ids.txt"
: >"$run_ids_file"

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
}
trap cleanup EXIT

pkill -f "dist/worker/main.js" 2>/dev/null || true
pkill -f "dist/api-shim/main.js" 2>/dev/null || true

echo "[sandbox-soak] starting API shim..."
DBOS__APPVERSION="$app_version" node dist/api-shim/main.js >"$log_shim" 2>&1 &
PID_SHIM=$!

echo "[sandbox-soak] starting worker..."
DBOS__APPVERSION="$app_version" node dist/worker/main.js >"$log_worker" 2>&1 &
PID_WORKER=$!

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

echo "[sandbox-soak] enqueueing ${total} sandbox runs..."
for i in $(seq 1 "$total"); do
  intent_res=$(curl -sf -X POST "${base_url}/intents" \
    -H "Content-Type: application/json" \
    -d "{\"goal\":\"sleep 1\",\"inputs\":{\"n\":${i}},\"constraints\":{}}")
  intent_id=$(echo "$intent_res" | jq -r .intentId)

  run_res=$(curl -sf -X POST "${base_url}/intents/${intent_id}/run" \
    -H "Content-Type: application/json" \
    -d '{"queueName":"sbxQ","recipeName":"sandbox-default","workload":{"concurrency":10,"steps":8,"sandboxMinutes":5}}')
  run_id=$(echo "$run_res" | jq -r .runId)
  echo "$run_id" >>"$run_ids_file"

  approve_res=$(curl -sf -X POST "${base_url}/runs/${run_id}/approve-plan" \
    -H "Content-Type: application/json" \
    -d '{"approvedBy":"sandbox-soak"}')
  if [ "$(echo "$approve_res" | jq -r .accepted)" != "true" ]; then
    echo "ERROR: failed to approve plan for run ${run_id}"
    exit 1
  fi
done

echo "[sandbox-soak] waiting for completion..."
for tick in $(seq 1 240); do
  succeeded=0
  failed=0
  waiting=0
  queued=0
  while IFS= read -r run_id; do
    status=$(curl -sf "${base_url}/runs/${run_id}" | jq -r .status)
    if [ "$status" = "succeeded" ]; then
      succeeded=$((succeeded + 1))
    elif [ "$status" = "failed" ] || [ "$status" = "retries_exceeded" ]; then
      failed=$((failed + 1))
    elif [ "$status" = "waiting_input" ]; then
      waiting=$((waiting + 1))
    elif [ "$status" = "queued" ]; then
      queued=$((queued + 1))
    fi
  done <"$run_ids_file"

  if [ $((tick % 20)) -eq 0 ]; then
    echo "[sandbox-soak] progress succeeded=${succeeded}/${total} queued=${queued} waiting=${waiting}"
  fi

  if [ "$failed" -gt 0 ]; then
    echo "ERROR: ${failed} runs failed in sandbox soak"
    exit 1
  fi
  if [ "$succeeded" -eq "$total" ]; then
    break
  fi
  sleep 1
done

final_succeeded=0
while IFS= read -r run_id; do
  status=$(curl -sf "${base_url}/runs/${run_id}" | jq -r .status)
  if [ "$status" = "succeeded" ]; then
    final_succeeded=$((final_succeeded + 1))
  fi
done <"$run_ids_file"
if [ "$final_succeeded" -ne "$total" ]; then
  echo "ERROR: timeout waiting for all runs to succeed (${final_succeeded}/${total})"
  exit 1
fi

dup_count=$(docker compose exec -T db psql -tA -U "${DB_USER:-postgres}" -d "${APP_DB_NAME:-app_local}" -c \
  "SELECT COUNT(*) FROM app.mock_receipts WHERE seen_count > 1;" | tr -d '\r' | xargs)
if [ "${dup_count:-0}" != "0" ]; then
  echo "ERROR: duplicate side effect receipts detected (${dup_count})"
  exit 1
fi

receipt_count=$(docker compose exec -T db psql -tA -U "${DB_USER:-postgres}" -d "${APP_DB_NAME:-app_local}" -c \
  "SELECT COUNT(*) FROM app.mock_receipts WHERE step_id = 'ExecuteST';" | tr -d '\r' | xargs)
if [ "${receipt_count:-0}" -lt "$total" ]; then
  echo "ERROR: missing receipts for sandbox soak (${receipt_count}/${total})"
  exit 1
fi

echo "[sandbox-soak] OK (${total} runs, duplicate_receipts=0)"
