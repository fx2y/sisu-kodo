#!/bin/bash
# S.OC.HEALTH.CURL
MAX_RETRIES=${OC_HEALTH_RETRIES:-40}
RETRY_INTERVAL=0.5

for i in $(seq 1 $MAX_RETRIES); do
  if curl -sf http://127.0.0.1:4096/global/health | jq -e '.healthy==true' >/dev/null 2>&1; then
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
