# 007 Spec-07 Live Ops Control-Plane Field Manual (As-Built 2026-02-20)

## 0) Hard Stance

- Use this for real ops value, not architecture tour.
- Truth source: SQL (`app.*`, `dbos.workflow_status`), never logs.
- Product identity: `workflowID=intentId`.
- Product steps: `CompileST|ApplyPatchST|DecideST|ExecuteST`.
- Parent run queue: `intentQ` only.
- Child fanout queue: `sbxQ` only.
- Partition law (default on): non-blank `queuePartitionKey` required for parent starts.
- Fail-closed law: malformed JSON/schema/policy => deterministic `400` + zero writes.
- Signoff law: `quick && check && full`; soaks admissible only with `-f`.

## 1) What You Get

- Deterministic `/api` data plane (`/api/intents`, `/api/runs`, `/api/runs/:wid*`).
- Deterministic ops plane (`/api/ops/wf*` exact six routes).
- Real control semantics (cancel/resume/fork) with durable op-intent artifacts.
- Time primitives (durable sleep + scheduler catch-up).
- OTLP fail-fast wiring + trace-link guards.
- Ops kit (batch scripts + SQL ops views).
- Live e2e and release gates already wired in `mise`.

## 2) Surfaces (Use This Mental Model)

- Data plane: create/start/read/approve/artifacts.
- Control plane: list/get/steps/cancel/resume/fork.
- Proof plane: `mise` DAG + SQL oracles.

## 3) One-Time Bootstrap

```bash
MISE_TASK_OUTPUT=prefix mise install
mise run db:up
mise run db:sys:reset
mise run db:reset
mise run build
mise run quick
```

Pass = green `quick`.

## 4) Runtime Tracks

- Monolith (fastest): `mise run start`
- Split parity: `mise run start:worker` + `mise run start:api-shim` with shared `DBOS__APPVERSION`
- Local deterministic defaults: `OC_MODE=replay SBX_MODE=mock`
- Signoff strictness: `SBX_QUEUE_PARTITION=true`

## 5) Reusable Shell Kit

```bash
BASE=http://127.0.0.1:3001
term='SUCCESS|ERROR|CANCELLED'
wait_h(){ id="$1"; for i in $(seq 1 240); do s=$(curl -sS "$BASE/api/runs/$id" | jq -r '.status // empty'); echo "$s" | grep -Eq "$term" && return 0; sleep 0.5; done; return 1; }
wait_next(){ id="$1"; want="$2"; for i in $(seq 1 240); do n=$(curl -sS "$BASE/api/runs/$id" | jq -r '.nextAction // empty'); [ "$n" = "$want" ] && return 0; sleep 0.5; done; return 1; }
sql_app(){ scripts/db/psql-app.sh -c "$1"; }
sql_sys(){ scripts/db/psql-sys.sh -c "$1"; }
```

## 6) Lab A: Monolith Bring-Up (10s)

Terminal A:

```bash
OC_MODE=replay SBX_MODE=mock PORT=3001 ADMIN_PORT=3002 mise run start
```

Terminal B:

```bash
curl -sS $BASE/healthz | jq -e '.ok==true'
```

## 7) Lab B: Golden Product Flow (`/api` only)

```bash
INTENT=$(curl -sS -X POST $BASE/api/intents -H 'content-type: application/json' \
  -d '{"goal":"spec07 golden","inputs":{},"constraints":{}}' | jq -r .intentId)

WID=$(curl -sS -X POST $BASE/api/runs -H 'content-type: application/json' \
  -d "{\"intentId\":\"$INTENT\",\"queueName\":\"intentQ\",\"queuePartitionKey\":\"tenant-007\",\"recipeName\":\"sandbox-default\",\"workload\":{\"concurrency\":1,\"steps\":2,\"sandboxMinutes\":1}}" \
  | jq -r .workflowID)

echo "$INTENT $WID"
curl -sS $BASE/api/runs/$WID | jq '{workflowID,status,nextAction,lastStep}'
```

Expect: `workflowID==INTENT`, `status` in header enum.

## 8) Lab C: HITL Approve-Plan

```bash
wait_next "$WID" APPROVE_PLAN
curl -sS -X POST $BASE/api/runs/$WID/approve-plan -H 'content-type: application/json' \
  -d '{"approvedBy":"po-007","notes":"ship it"}' | jq
wait_h "$WID"
curl -sS $BASE/api/runs/$WID | jq '{status,nextAction,lastStep,error}'
```

Expect terminal `SUCCESS` for golden run.

## 9) Lab D: Step Timeline + Artifact Fetch

```bash
curl -sS $BASE/api/runs/$WID/steps | jq 'map({stepID,attempt,startedAt,artifacts:(.artifactRefs|length)})'
ART=$(curl -sS $BASE/api/runs/$WID/steps | jq -r 'map(.artifactRefs[]) | .[0].id')
AENC=$(printf '%s' "$ART" | jq -sRr @uri)
curl -sS -D /tmp/007-art.h "$BASE/api/artifacts/$AENC" -o /tmp/007-art.body
sed -n '1,20p' /tmp/007-art.h
head -c 300 /tmp/007-art.body; echo
```

Expect stable step order (`startedAt`, then `stepID`), artifact resolves by encoded `id`.

## 10) Lab E: Ops Plane Contract (exact six)

```bash
curl -sS "$BASE/api/ops/wf?limit=5" | jq '.[0]'
curl -sS "$BASE/api/ops/wf/$WID" | jq
curl -sS "$BASE/api/ops/wf/$WID/steps" | jq '.[0]'
```

Fail-closed probe:

```bash
curl -sS -o /tmp/007-ops400.out -w '%{http_code}\n' "$BASE/api/ops/wf?unknown=1"
cat /tmp/007-ops400.out
```

Expect `400`.

## 11) Lab F: Cancel/Resume Semantics (real boundary behavior)

```bash
WF=slow_$(date +%s)
curl -sS -X POST "$BASE/slowstep?wf=$WF&sleep=5000" | jq
until [ "$(curl -sS "$BASE/slowmarks?wf=$WF" | jq -r .s1)" = "1" ]; do sleep 0.2; done

curl -sS -X POST "$BASE/api/ops/wf/$WF/cancel" -H 'content-type: application/json' \
  -d '{"actor":"qa","reason":"boundary-proof"}' | jq
curl -sS "$BASE/api/ops/wf/$WF" | jq '{workflowID,status}'
curl -sS "$BASE/slowmarks?wf=$WF" | jq
```

Expect: `s1=1`, `s2=0`, status `CANCELLED` (cancel is checkpoint boundary, not mid-step kill).

Resume same workflow:

```bash
curl -sS -X POST "$BASE/api/ops/wf/$WF/resume" -H 'content-type: application/json' \
  -d '{"actor":"qa","reason":"continue"}' | jq
until [ "$(curl -sS "$BASE/slowmarks?wf=$WF" | jq -r .s2)" = "1" ]; do sleep 0.2; done
curl -sS "$BASE/api/ops/wf/$WF" | jq '{workflowID,status}'
```

Expect: same `workflowID`, terminal `SUCCESS`.

## 12) Lab G: Fork Semantics + Guard

Happy fork:

```bash
MAX=$(curl -sS "$BASE/api/ops/wf/$WF/steps" | jq '[.[].functionId]|max')
FORK=$(curl -sS -X POST "$BASE/api/ops/wf/$WF/fork" -H 'content-type: application/json' \
  -d "{\"stepN\":$MAX,\"actor\":\"qa\",\"reason\":\"fork-proof\"}" | jq -r .forkedWorkflowID)
echo "$WF -> $FORK"
curl -sS "$BASE/api/ops/wf/$FORK" | jq '{workflowID,status}'
```

Conflict guard:

```bash
curl -sS -o /tmp/007-fork409.out -w '%{http_code}\n' \
  -X POST "$BASE/api/ops/wf/$WF/fork" -H 'content-type: application/json' \
  -d '{"stepN":99999}'
cat /tmp/007-fork409.out
cat /tmp/007-fork409.out | jq -R .
```

Expect `409`.

## 13) Lab H: Op-Intent Artifact Oracle (audit durability)

```bash
sql_app "SELECT run_id,step_id,idx,kind,inline->>'op' op,inline->>'actor' actor,inline->>'reason' reason,inline->>'forkedWorkflowID' forked FROM app.artifacts WHERE step_id='OPS' ORDER BY created_at DESC LIMIT 20;"
```

Expect accepted cancel/resume/fork actions persisted as `kind=json_diagnostic`, `step_id=OPS`.

## 14) Lab I: Fail-Closed Matrix + Zero-Write Proof

Malformed JSON:

```bash
B=$(scripts/db/psql-app.sh -t -A -c "SELECT (SELECT COUNT(*) FROM app.intents)||(SELECT COUNT(*) FROM app.runs)||(SELECT COUNT(*) FROM app.artifacts)" | xargs)
curl -sS -o /tmp/007-badjson.out -w '%{http_code}\n' -X POST "$BASE/api/intents" -H 'content-type: application/json' -d '{bad'
A=$(scripts/db/psql-app.sh -t -A -c "SELECT (SELECT COUNT(*) FROM app.intents)||(SELECT COUNT(*) FROM app.runs)||(SELECT COUNT(*) FROM app.artifacts)" | xargs)
echo "code=$(cat /tmp/007-badjson.out) before=$B after=$A"
```

Schema reject:

```bash
curl -sS -o /tmp/007-runs400.out -w '%{http_code}\n' -X POST "$BASE/api/runs" -H 'content-type: application/json' \
  -d "{\"intentId\":\"$INTENT\",\"queuePartitionKey\":\"tenant-007\",\"extra\":true}"
cat /tmp/007-runs400.out
```

Policy reject (parent on `sbxQ` forbidden):

```bash
curl -sS -o /tmp/007-policy400.out -w '%{http_code}\n' -X POST "$BASE/api/runs" -H 'content-type: application/json' \
  -d "{\"intentId\":\"$INTENT\",\"queueName\":\"sbxQ\",\"recipeName\":\"sandbox-default\",\"workload\":{\"concurrency\":1,\"steps\":1,\"sandboxMinutes\":1},\"queuePartitionKey\":\"tenant-007\"}"
cat /tmp/007-policy400.out
```

Expect all `400`; first probe should keep counts unchanged.

## 15) Lab J: Time Primitive 1 (durable sleep with restart)

```bash
SWF=sleep_$(date +%s)
curl -sS -X POST "$BASE/api/ops/sleep?wf=$SWF&sleep=2000" | jq
sql_app "SELECT run_id,step_id,created_at FROM app.artifacts WHERE run_id='$SWF' AND step_id LIKE 'sleep-%' ORDER BY created_at;"
```

Expect `sleep-before-sleep` then `sleep-after-sleep`.

Crash/restart proof lane:

```bash
mise run wf:time:sleep
```

## 16) Lab K: Time Primitive 2 (scheduled catch-up)

```bash
sql_app "DELETE FROM app.artifacts WHERE step_id='ScheduledTick';"
sleep 35
sql_app "SELECT count(*) FROM app.artifacts WHERE step_id='ScheduledTick';"
```

Automation lane:

```bash
mise run wf:time:scheduler
mise run test:integration:mock:file test/integration/time-durability.test.ts
```

## 17) Lab L: Retry Closure / Repair Projection

```bash
mise run test:integration:mock:file test/integration/retry-backoff.test.ts
```

Expect (from SQL oracle assertions in test): attempts `3`, monotonic backoff, terminal projection `retries_exceeded + REPAIR`.

## 18) Lab M: OTLP Fail-Fast + Trace Guard

Receiver smoke (hard-fail when unreachable):

```bash
OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=http://127.0.0.1:4318 \
OTEL_EXPORTER_OTLP_LOGS_ENDPOINT=http://127.0.0.1:4318 \
OTLP_REQUIRED=1 mise run otlp:smoke
```

Trace template guard:

```bash
TRACE_BASE_URL='https://trace.example/trace/{traceId}/span/{spanId}' mise run test:unit
```

## 19) Lab N: Ops Kit (batch + views)

```bash
mise run ops:list-failed
printf '%s\n' "$WF" | mise run ops:cancel-batch
printf '%s\n' "$WF" | mise run ops:resume-batch
printf '%s\n' "$WF" | mise run ops:fork-batch 1 v1
mise run ops:sql:inbox
mise run ops:sql:slow
mise run ops:sql:queues
scripts/policy-ops-surface.sh
```

## 20) Lab O: SQL Oracle Pack (copy/paste)

```bash
sql_app "SELECT id,intent_id,workflow_id,status,last_step,retry_count,next_action,error FROM app.runs ORDER BY created_at DESC LIMIT 20;"
sql_app "SELECT run_id,step_id,attempt,trace_id,span_id,started_at,finished_at FROM app.run_steps ORDER BY started_at DESC NULLS LAST, step_id, attempt LIMIT 40;"
sql_app "SELECT run_id,step_id,idx,kind,uri,sha256 FROM app.artifacts ORDER BY created_at DESC LIMIT 60;"
sql_app "SELECT run_id,task_key,attempt,err_code,created_at FROM app.sbx_runs ORDER BY created_at DESC LIMIT 60;"
sql_sys "SELECT workflow_uuid,status,queue_name,application_version,recovery_attempts FROM dbos.workflow_status ORDER BY updated_at DESC LIMIT 40;"
```

Exactly-once checks:

```bash
sql_app "SELECT run_id,count(*) dup FROM app.mock_receipts WHERE seen_count>1 GROUP BY run_id;"
sql_app "SELECT run_id,step_id,attempt,count(*) c FROM app.run_steps GROUP BY run_id,step_id,attempt HAVING count(*)>1;"
sql_app "SELECT run_id,step_id,attempt,idx,count(*) c FROM app.artifacts GROUP BY run_id,step_id,attempt,idx HAVING count(*)>1;"
```

Expect zero rows on duplicate checks.

## 21) Lab P: Split Topology Parity (worker+shim)

Terminal A:

```bash
OC_MODE=replay SBX_MODE=mock DBOS__APPVERSION=v1 PORT=3011 ADMIN_PORT=3012 mise run start:worker
```

Terminal B:

```bash
OC_MODE=replay SBX_MODE=mock DBOS__APPVERSION=v1 PORT=3011 ADMIN_PORT=3012 mise run start:api-shim
```

Terminal C:

```bash
BASE=http://127.0.0.1:3011
curl -sS $BASE/healthz | jq -e '.ok==true'
```

Rule: appVersion mismatch => queue stall.

## 22) Lab Q: Live E2E + Release Gates

Dev gate:

```bash
mise run quick
```

Pre-merge gate:

```bash
mise run check
```

Preserve current DB state during manual debugging:

```bash
MISE_NO_RESET=1 mise run check
MISE_NO_RESET=1 mise run otlp:smoke
```

Signoff gate:

```bash
mise run full
mise run -f wf:intent:chaos:soak
mise run -f sandbox:soak
```

Targeted e2e:

```bash
mise run test:e2e:file test/e2e/ops-controls.test.ts
mise run test:e2e:file test/e2e/api-shim.test.ts
mise run test:e2e:file test/e2e/plan-approval-api.test.ts
```

## 23) Lab R: Live Integrations (real OC/SBX path)

Use when you have credentials/network; otherwise stay on replay/mock.

```bash
OC_SERVER_PORT=4096 mise run oc:daemon:signoff
OC_SERVER_PORT=4096 mise run oc:daemon:contract
OC_MODE=live mise run oc:live:smoke
SBX_MODE=live SBX_PROVIDER=e2b mise run sbx:live:smoke
```

Strict signoff posture:

```bash
OC_STRICT_MODE=1 SBX_QUEUE_PARTITION=true mise run full
```

## 24) Triage Order (when UI and evidence disagree)

1. `GET /healthz`
2. `GET /api/ops/wf/:wid`
3. `GET /api/runs/:wid`
4. SQL: `app.runs`
5. SQL: `app.run_steps` + `app.artifacts`
6. SQL: `dbos.workflow_status`
7. Logs last

## 25) 10-Minute Demo Script (PO-safe)

1. `mise run quick`
2. Start monolith (`OC_MODE=replay SBX_MODE=mock mise run start`)
3. Run Labs B+C+D
4. Run Lab F (cancel/resume) once
5. Show Lab H query (OPS artifacts)
6. Show Lab O duplicate checks (0 rows)
7. Close with `mise run check`

## 26) Footguns (do-not)

- Using logs as proof.
- Starting parent intents on `sbxQ`.
- Omitting `queuePartitionKey` in partition mode.
- Adding extra `/api/ops/wf*` routes.
- Expanding retries beyond execute allowlist.
- Treating cancel as kill-now (it is checkpoint-boundary).
