#!/usr/bin/env bash
set -euo pipefail

BASE="${BASE:-http://127.0.0.1:3001}"
QPK="${QPK:-adr008-qpk}"

echo "[boot] health"
curl -sf "$BASE/healthz" | jq

echo "[po] intent"
INTENT=$(curl -sf -X POST "$BASE/api/intents" -H 'content-type: application/json' \
  -d '{"goal":"demo ask","inputs":{},"constraints":{}}' | jq -r .intentId)

echo "[po] run"
WID=$(curl -sf -X POST "$BASE/api/runs" -H 'content-type: application/json' -d '{
  "intentId":"'"$INTENT"'",
  "queueName":"intentQ",
  "queuePartitionKey":"'"$QPK"'",
  "recipeName":"compile-default",
  "workload":{"concurrency":1,"steps":1,"sandboxMinutes":1}
}' | jq -r .workflowID)

echo "WID=$WID"

until curl -sf "$BASE/api/runs/$WID/gates" | jq -e 'length>0' >/dev/null; do sleep 1; done
GATE=$(curl -sf "$BASE/api/runs/$WID/gates" | jq -r '.[0].gateKey')

echo "[po] gate state pre-reply"
curl -sf "$BASE/api/runs/$WID/gates/$GATE?timeoutS=3" | jq '{gateKey,state,deadlineAt}'

echo "[po] reply yes"
curl -sf -X POST "$BASE/api/runs/$WID/gates/$GATE/reply" -H 'content-type: application/json' -d '{
  "payload":{"choice":"yes","rationale":"adr008"},
  "dedupeKey":"adr008-yes-1"
}' | jq

echo "[qa] dedupe conflict => 409"
HTTP=$(curl -s -o /tmp/adr008-conf.out -w '%{http_code}' -X POST "$BASE/api/runs/$WID/gates/$GATE/reply" \
  -H 'content-type: application/json' -d '{"payload":{"choice":"no"},"dedupeKey":"adr008-yes-1"}')
echo "status=$HTTP"
test "$HTTP" = "409"

echo "[qa] malformed receiver json => 400"
HTTP=$(curl -s -o /tmp/adr008-badj.out -w '%{http_code}' -X POST "$BASE/api/events/hitl" \
  -H 'content-type: application/json' -d '{bad')
echo "status=$HTTP"
test "$HTTP" = "400"

echo "[done] use 10-sql-oracles.sql for proof pack"
