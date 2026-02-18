#!/usr/bin/env bash
set -euo pipefail

# deterministic baseline
mise install
mise run quick

# crash durability oracle
PORT=3004 ADMIN_PORT=3006 mise run -f wf:crashdemo
mise run db:query -- "SELECT step,COUNT(*) c FROM app.marks WHERE run_id=(SELECT id FROM app.workflow_runs ORDER BY started_at DESC LIMIT 1) GROUP BY step ORDER BY step"

# enqueue + dual lookup
intent_json=$(curl -sS -X POST :3001/intents -H 'content-type: application/json' -d '{"goal":"demo"}')
intent_id=$(printf '%s' "$intent_json" | jq -r '.intentId')
run_json=$(curl -sS -X POST :3001/intents/"$intent_id"/run -H 'content-type: application/json' -d '{}')
run_id=$(printf '%s' "$run_json" | jq -r '.runId')
wf_id=$(printf '%s' "$run_json" | jq -r '.workflowId')
curl -sS :3001/runs/"$run_id" | jq .
curl -sS :3001/runs/"$wf_id" | jq .

# fail-closed ingress examples
curl -i -sS -X POST :3001/intents/"$intent_id"/run -H 'content-type: application/json' -d '{'
curl -i -sS -X POST :3001/intents/"$intent_id"/run -H 'content-type: application/json' -d '{"queueName":123}'

# retry contract
curl -sS -X POST :3001/runs/"$run_id"/retry -H 'content-type: application/json' -d '{}' | jq .

# hitl event contract (202 only in waiting_input; else 409)
curl -i -sS -X POST :3001/runs/"$run_id"/events -H 'content-type: application/json' -d '{"type":"human-event","payload":{"answer":"ok"}}'

# SQL forensics
mise run db:query -- "SELECT run_id,step,output->>'attempt' attempt FROM app.run_steps ORDER BY started_at DESC LIMIT 40"
mise run db:query -- "SELECT receipt_key,seen_count FROM app.mock_receipts ORDER BY seen_count DESC, receipt_key LIMIT 40"
mise run db:query -- "SELECT run_id,step,request,response FROM app.opencode_calls ORDER BY started_at DESC LIMIT 20"

# policy self-tests
mise run -f policy:shim-blackbox
mise run -f policy:wf-purity
mise run -f policy:task-sources

# composite sign-off proofline
mise run -f wf:intent:chaos:soak
mise run -f sandbox:soak
mise run check
mise run full
