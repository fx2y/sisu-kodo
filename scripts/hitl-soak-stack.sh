#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 1 ]; then
  echo "usage: scripts/hitl-soak-stack.sh <command...>" >&2
  exit 2
fi

mkdir -p .tmp

PORT="${PORT:-3021}"
WORKER_ADMIN_PORT="${WORKER_ADMIN_PORT:-$((PORT + 1))}"
SHIM_ADMIN_PORT="${SHIM_ADMIN_PORT:-$((PORT + 2))}"
OC_PORT="${OC_PORT:-4297}"
BASE_URL="http://127.0.0.1:${PORT}"
APP_VERSION="${DBOS__APPVERSION:-hitl-c7-${$}}"

log_worker=".tmp/hitl-c7-worker.log"
log_shim=".tmp/hitl-c7-shim.log"
log_oc=".tmp/hitl-c7-oc.log"

stop_pid() {
  local pid="$1"
  if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
    kill "$pid" 2>/dev/null || true
    for _ in $(seq 1 30); do
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

echo "[hitl-soak] starting OC mock on :${OC_PORT}"
OC_MOCK_LOG=".tmp/oc-mock-hitl-c7.log" pnpm exec tsx scripts/oc-mock-daemon.ts "${OC_PORT}" >"${log_oc}" 2>&1 &
PID_OC=$!

for _ in $(seq 1 80); do
  if curl -sf "http://127.0.0.1:${OC_PORT}/global/health" >/dev/null; then
    break
  fi
  sleep 0.25
done

echo "[hitl-soak] starting worker (admin=${WORKER_ADMIN_PORT}, appVersion=${APP_VERSION})"
PORT="${PORT}" \
ADMIN_PORT="${WORKER_ADMIN_PORT}" \
OC_MODE="live" \
OC_BASE_URL="http://127.0.0.1:${OC_PORT}" \
DBOS__APPVERSION="${APP_VERSION}" \
node dist/worker/main.js >"${log_worker}" 2>&1 &
PID_WORKER=$!

for _ in $(seq 1 120); do
  if grep -q "DBOS worker launched" "${log_worker}"; then
    break
  fi
  sleep 0.25
done

echo "[hitl-soak] starting API shim on :${PORT} (admin=${SHIM_ADMIN_PORT})"
PORT="${PORT}" \
ADMIN_PORT="${SHIM_ADMIN_PORT}" \
OC_MODE="live" \
OC_BASE_URL="http://127.0.0.1:${OC_PORT}" \
DBOS__APPVERSION="${APP_VERSION}" \
node dist/api-shim/main.js >"${log_shim}" 2>&1 &
PID_SHIM=$!

for _ in $(seq 1 120); do
  if curl -sf "${BASE_URL}/healthz" >/dev/null; then
    break
  fi
  sleep 0.25
done

echo "[hitl-soak] stack ready on ${BASE_URL}"
"$@"
echo "[hitl-soak] command finished"
