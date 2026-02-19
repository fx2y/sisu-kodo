# 005 Live E2E Operator Field Manual (C7, As-Built 2026-02-19)

## 0) Stance

- Objective: real value now (`/intents -> /intents/:id/run -> /runs/:id|:workflowId`) with DB-proofed determinism.
- Law: SQL rows are truth; logs are hints.
- Law: parent WF queue is `intentQ` only; child fanout queue is `sbxQ`.
- Law: `workflowId=intentId`; stable steps `CompileST|ApplyPatchST|DecideST|ExecuteST`.
- Law: fail-closed ingress (`400/409`) + zero writes on reject.
- Law: `-f` required for soak/repeat evidence.

## 1) Reality Envelope

- Shipped: DBOS runtime, split topology, approval/HITL, repair, fanout, streaming notifications, artifact index, chaos/crash/soak proofs.
- Live OC: real daemon path, but strict signoff requires `OC_STRICT_MODE=1` (no auth-missing skip).
- Live SBX: `e2b` default prod path; `microsandbox` deterministic unsupported unless explicitly enabled.

## 2) Tracks

- PO (10-15m): `L00 -> L02 -> L05 -> L11 -> L15 -> L18`.
- QA (30-45m): `L00 -> L03 -> L04 -> L09 -> L10 -> L12 -> L13 -> L18`.
- FDE (45-60m): `L00 -> L08 -> L07 -> L14 -> L16 -> L17 -> L18`.

## 3) Bootstrap (L00)

```bash
mise install
mise run db:up
mise run db:reset
mise run db:sys:reset
mise run build
mise run quick
```

Pass: `quick` green, DB healthy, policies green, clean schemas.

## 4) Reusable Shell Helpers

```bash
BASE=http://127.0.0.1:3001
wait_status(){ id="$1"; want="$2"; for i in $(seq 1 180); do s=$(curl -sS "$BASE/runs/$id" | jq -r .status); [ "$s" = "$want" ] && return 0; sleep 0.25; done; return 1; }
new_intent(){ curl -sS -X POST "$BASE/intents" -H 'content-type: application/json' -d "$1" | jq -r .intentId; }
new_run(){ iid="$1"; body="$2"; curl -sS -X POST "$BASE/intents/$iid/run" -H 'content-type: application/json' -d "$body"; }
sql_app(){ docker compose exec -T db psql -U "${DB_USER:-postgres}" -d "${APP_DB_NAME:-app_local}" -c "$1"; }
sql_sys(){ scripts/db/psql-sys.sh -c "$1"; }
```

## 5) Labs

### L01: Health + Schema Split

```bash
sql_sys '\dt dbos.*'
sql_app '\dt app.*'
```

Pass: both schema sets present; no cross-drift.

### L02: Happy Path (Monolith)

Terminal A:

```bash
mise run stop || true
PORT=3001 ADMIN_PORT=3002 OC_MODE=replay SBX_MODE=mock mise run start
```

Terminal B:

```bash
curl -sS "$BASE/healthz" | jq -e '.ok==true'
I=$(new_intent '{"goal":"demo","inputs":{},"constraints":{}}')
R=$(new_run "$I" '{"traceId":"demo-trace","queueName":"intentQ","recipeName":"sandbox-default","queuePartitionKey":"tenant-demo","workload":{"concurrency":2,"steps":3,"sandboxMinutes":2}}' | jq -r .runId)
wait_status "$R" waiting_input
curl -sS -X POST "$BASE/runs/$R/approve-plan" -H 'content-type: application/json' -d '{"approvedBy":"po-demo"}' | jq
wait_status "$R" succeeded
curl -sS "$BASE/runs/$R" | jq '{runId,workflowId,status,lastStep,retryCount,steps:[.steps[].stepId]}'
curl -sS "$BASE/runs/$R" | jq -e --arg i "$I" '.workflowId==$i'
```

Pass: `status=succeeded`, `lastStep=ExecuteST`, workflowId equals intentId.

### L03: Fail-Closed Ingress

```bash
curl -sS -o /tmp/t05.badjson -w '%{http_code}\n' -X POST "$BASE/intents" -H 'content-type: application/json' -d '{bad'
curl -sS -o /tmp/t05.badintent -w '%{http_code}\n' -X POST "$BASE/intents" -H 'content-type: application/json' -d '{"inputs":{},"constraints":{}}'
curl -sS -o /tmp/t05.badrun -w '%{http_code}\n' -X POST "$BASE/intents/$I/run" -H 'content-type: application/json' -d '{"unknownField":"x"}'
cat /tmp/t05.badjson /tmp/t05.badintent /tmp/t05.badrun
```

Pass: all `400`, deterministic JSON errors.

### L04: Zero-Write Guard on Reject

```bash
B=$(docker compose exec -T db psql -tA -U "${DB_USER:-postgres}" -d "${APP_DB_NAME:-app_local}" -c "SELECT COUNT(*) FROM app.runs;" | tr -d '\r' | xargs)
curl -sS -o /tmp/t05.cap -w '%{http_code}\n' -X POST "$BASE/intents/$I/run" -H 'content-type: application/json' -d '{"queueName":"intentQ","recipeName":"sandbox-default","queuePartitionKey":"tenant-demo","workload":{"concurrency":999,"steps":1,"sandboxMinutes":1}}'
cat /tmp/t05.cap
A=$(docker compose exec -T db psql -tA -U "${DB_USER:-postgres}" -d "${APP_DB_NAME:-app_local}" -c "SELECT COUNT(*) FROM app.runs;" | tr -d '\r' | xargs)
echo "before=$B after=$A"
```

Pass: `400` with `code=queue_policy_violation`; `before==after`.

### L05: HITL + Approval Contract

```bash
I_ASK=$(new_intent '{"goal":"ask user for approval","inputs":{},"constraints":{}}')
R_ASK=$(new_run "$I_ASK" '{"queueName":"intentQ","recipeName":"sandbox-default","queuePartitionKey":"ask-tenant"}' | jq -r .runId)
wait_status "$R_ASK" waiting_input
curl -sS -X POST "$BASE/runs/$R_ASK/events" -H 'content-type: application/json' -d '{"type":"input","payload":{"answer":"yes"}}' | jq
wait_status "$R_ASK" waiting_input
curl -sS -X POST "$BASE/runs/$R_ASK/approve-plan" -H 'content-type: application/json' -d '{"approvedBy":"qa"}' | jq
wait_status "$R_ASK" succeeded
```

Pass: `/events` accepted only in `waiting_input`; run converges after approve.

### L06: Repair Envelope

```bash
I_F=$(new_intent '{"goal":"fail me","inputs":{},"constraints":{}}')
R_F=$(new_run "$I_F" '{"queueName":"intentQ","recipeName":"sandbox-default","queuePartitionKey":"repair-tenant"}' | jq -r .runId)
wait_status "$R_F" waiting_input
curl -sS -X POST "$BASE/runs/$R_F/approve-plan" -H 'content-type: application/json' -d '{"approvedBy":"qa"}' | jq
wait_status "$R_F" retries_exceeded
curl -sS "$BASE/runs/$R_F" | jq '{status,nextAction,lastStep,retryCount,error}'
curl -sS -X POST "$BASE/runs/$R_F/retry" | jq
```

Pass: retry envelope `{accepted:true,newRunId:<same>,fromStep:"ExecuteST"}`.

### L07: Split Topology Parity

Terminal A (daemon):

```bash
OC_SERVER_PORT=4096 mise run -f oc:daemon:up
OC_SERVER_PORT=4096 mise run -f oc:daemon:health
```

Terminal B (worker):

```bash
PORT=3001 ADMIN_PORT=3002 DBOS__APPVERSION=demo-v1 OC_MODE=live OC_BASE_URL=http://127.0.0.1:4096 SBX_MODE=mock mise run start:worker
```

Terminal C (shim):

```bash
PORT=3001 ADMIN_PORT=3002 DBOS__APPVERSION=demo-v1 OC_MODE=live OC_BASE_URL=http://127.0.0.1:4096 mise run start:api-shim
```

Terminal D (probe):

```bash
I2=$(new_intent '{"goal":"split-topology","inputs":{},"constraints":{}}')
R2=$(new_run "$I2" '{"traceId":"split","queueName":"intentQ","recipeName":"sandbox-default","queuePartitionKey":"tenant-split","workload":{"concurrency":1,"steps":2,"sandboxMinutes":1}}' | jq -r .runId)
wait_status "$R2" waiting_input
curl -sS -X POST "$BASE/runs/$R2/approve-plan" -H 'content-type: application/json' -d '{"approvedBy":"po"}' >/dev/null
wait_status "$R2" succeeded
W2=$(curl -sS "$BASE/runs/$R2" | jq -r .workflowId)
test "$W2" = "$I2"
curl -sS "$BASE/runs/$W2" | jq -e --arg r "$R2" '.runId==$r'
```

Pass: queued work drains only when worker up; `DBOS__APPVERSION` mismatch => stuck queue.

### L08: Fanout Exactly-Once (N=100 + restart)

```bash
mise run -f sandbox:fanout:soak
sql_app "SELECT COUNT(*) dup_receipts FROM app.mock_receipts WHERE seen_count>1;"
sql_app "SELECT task_key,COUNT(*) c FROM app.sbx_runs GROUP BY task_key HAVING COUNT(*)>1;"
```

Pass: duplicate receipt/task-key sets empty.

### L09: Queue Fairness + Rate

```bash
mise run test:integration:mock:file -- test/integration/queue-partition-fairness.test.ts
mise run test:integration:mock:file -- test/integration/queue-rate-limit.test.ts
sql_sys "SELECT queue_partition_key,COUNT(*) FROM dbos.workflow_status WHERE queue_name='sbxQ' GROUP BY queue_partition_key ORDER BY queue_partition_key;"
sql_sys "SELECT workflow_uuid,started_at_epoch_ms FROM dbos.workflow_status WHERE queue_name='sbxQ' ORDER BY started_at_epoch_ms DESC LIMIT 20;"
```

Pass: partition keys propagate; start-time spacing respects configured rate windows.

### L10: Streaming Telemetry Oracle

```bash
mise run test:integration:mock:file -- test/integration/sbx-streaming.test.ts
TK=$(docker compose exec -T db psql -tA -U "${DB_USER:-postgres}" -d "${APP_DB_NAME:-app_local}" -c "SELECT task_key FROM app.sbx_runs ORDER BY created_at DESC LIMIT 1;" | tr -d '\r' | xargs)
scripts/db/psql-sys.sh -c "SELECT topic,message FROM dbos.notifications WHERE destination_uuid='${TK}' ORDER BY created_at_epoch_ms;"
```

Pass: ordered stdout/stderr chunks + terminal `stream_closed`.

### L11: Artifact Integrity + Canonical Refs

```bash
sql_app "SELECT run_id,step_id,task_key,idx,attempt,kind,uri,sha256 FROM app.artifacts WHERE step_id='ExecuteST' ORDER BY created_at DESC LIMIT 30;"
sql_app "SELECT COUNT(*) bad_sha FROM app.artifacts WHERE sha256 !~ '^[0-9a-f]{64}$';"
sql_app "SELECT COUNT(*) bad_uri FROM app.artifacts WHERE kind!='question_card' AND uri IS NOT NULL AND uri !~ '^artifact://run/.+/step/.+/task/.+/.+';"
```

Pass: `bad_sha=0`, `bad_uri=0`, `idx=0` rows are `artifact_index`.

### L12: Crash Durability Floor

```bash
PORT=3004 ADMIN_PORT=3006 mise run -f wf:crashdemo
sql_sys "SELECT workflow_uuid,status FROM dbos.workflow_status ORDER BY updated_at_epoch_ms DESC LIMIT 5;"
sql_app "SELECT run_id,step,COUNT(*) c FROM app.marks GROUP BY run_id,step ORDER BY run_id DESC,step LIMIT 10;"
```

Pass: latest crash workflow `SUCCESS`; marks settle `s1=1,s2=1`.

### L13: Intent Chaos Durability

```bash
mise run -f wf:intent:chaos
sql_app "SELECT COUNT(*) dup FROM app.mock_receipts WHERE seen_count>1;"
sql_app "SELECT run_id,COUNT(*) sbx_tasks FROM app.sbx_runs GROUP BY run_id ORDER BY sbx_tasks DESC LIMIT 5;"
```

Pass: converges `succeeded`; `dup=0`.

### L14: RunView Golden Determinism

```bash
mise run test:e2e:file test/e2e/run-view-golden.test.ts
# only after intentional projection change:
# REFRESH_GOLDEN=1 mise run test:golden:refresh
```

### L15: Soak + Perf

```bash
mise run -f sandbox:soak
mise run -f wf:intent:chaos:soak
mise run -f test:unit:soak
./scripts/sbx-perf-report.sh run_
```

Pass: all green, duplicate receipts remain zero, p95/p99 emitted from SQL metrics.

### L16: Strict Live-Smoke Signoff

```bash
OC_STRICT_MODE=1 OC_SERVER_PORT=4096 mise run -f oc:daemon:up
OC_STRICT_MODE=1 OC_SERVER_PORT=4096 mise run -f oc:daemon:health
OC_STRICT_MODE=1 OC_MODE=live OC_BASE_URL=http://127.0.0.1:4096 mise run oc:live:smoke
OC_STRICT_MODE=1 SBX_MODE=live SBX_PROVIDER=e2b mise run sbx:live:smoke
OC_STRICT_MODE=1 SBX_MODE=live SBX_PROVIDER=microsandbox SBX_ALT_PROVIDER_ENABLED=true mise run sbx:live:smoke
```

Pass: no credential-missing skip in strict mode; microsandbox path returns deterministic unsupported, not fallback.

### L17: Release Gate

```bash
mise run quick
mise run check
mise run full
mise run -f wf:intent:chaos:soak
mise run -f sandbox:soak
sql_app "SELECT output->>'attempt' attempt,COUNT(*) FROM app.run_steps WHERE step_id='ExecuteST' GROUP BY 1 ORDER BY 1;"
sql_app "SELECT COUNT(*) dup_receipts FROM app.mock_receipts WHERE seen_count>1;"
sql_app "SELECT run_id,step_id,task_key,attempt,COUNT(*) FROM app.sbx_runs GROUP BY run_id,step_id,task_key,attempt HAVING COUNT(*)>1;"
```

Ship only if all green and duplicate queries return zero rows.

## 6) Triage (L18)

- Symptom: runs stuck `queued`. Check worker up, shim/worker `DBOS__APPVERSION` parity, `dbos.workflow_status` depth.
- Symptom: `409` on `/runs/:id/events`. Check run status is `waiting_input`, payload matches `RunEvent`.
- Symptom: `409` on `/runs/:id/retry`. Check status `failed|retries_exceeded`.
- Symptom: `EADDRINUSE`. Run `mise run stop`; isolate `PORT/ADMIN_PORT`.
- Symptom: queue policy `400`. Check parent queue is `intentQ`, recipe exists, workload caps, partition key propagation.

## 7) Minimal Credible Demo Script

```bash
mise install && mise run db:reset && mise run db:sys:reset && mise run quick
# run L02 + L03 + L04 + L06 + L12
mise run check && mise run test:e2e
```

If any oracle fails, do not claim production-demo readiness.
