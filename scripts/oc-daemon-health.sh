#!/usr/bin/env bash
set -euo pipefail

# S.OC.HEALTH.CURL
MAX_RETRIES=${OC_HEALTH_RETRIES:-40}
RETRY_INTERVAL=0.5
PORT="${OC_SERVER_PORT:-4096}"
HOST="${OC_SERVER_HOST:-127.0.0.1}"
BASE_URL="http://${HOST}:${PORT}"

for i in $(seq 1 $MAX_RETRIES); do
  if curl -sf "${BASE_URL}/global/health" | jq -e '.healthy==true' >/dev/null 2>&1; then
    echo "OC Daemon is healthy"
    exit 0
  fi
  if [ $((i % 10)) -eq 0 ]; then
    echo "Waiting for OC Daemon... ($i/$MAX_RETRIES)"
  fi
  sleep $RETRY_INTERVAL
done

echo "OC Daemon health check failed after $MAX_RETRIES retries"
exit 1
