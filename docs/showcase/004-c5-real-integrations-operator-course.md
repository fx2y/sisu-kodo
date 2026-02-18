# 004 C5 Real-Integrations Operator Course (As Built, 2026-02-18)

## 0) Contract First

Use this when you need value now, not architecture theater.

Non-negotiable:

- `mise` only.
- SQL oracles > logs.
- `workflowID=intentId`.
- fixed steps: `CompileST|ApplyPatchST|DecideST|ExecuteST`.
- fail-closed API (`400/409`) > permissive fallback.
- exactly-once proven in DB (`op_key` unique + `ON CONFLICT DO NOTHING`).
- split topology: shim=enq/read only; worker=workflow execution only.

Reality envelope:

- shipped: daemon contract, OC wrapper seam, structured compile, approval gate, C5 hardening, e2e proofs.
- still constrained: `oc:live:smoke` and `sbx:live:smoke` are smoke/stub lanes, not full provider/microVM proof.

## 1) B0 Baseline (Deterministic Boot)

```bash
mise install
mise run db:reset
mise run db:sys:reset
mise run build
mise run quick
mise run -f oc:daemon:contract
```

Pass means: local policy/type/unit/integration/crashdemo/OC-contract baseline is green.

## 2) B1 Real Runtime Bring-Up (Daemon + Worker + Shim)

Terminal A (OC daemon, aligned to app default `4096`):

```bash
OC_SERVER_PORT=4096 mise run -f oc:daemon:up
OC_SERVER_PORT=4096 mise run -f oc:daemon:health
```

Terminal B (worker):

```bash
OC_MODE=live OC_BASE_URL=http://127.0.0.1:4096 PORT=3001 ADMIN_PORT=3002 DBOS__APPVERSION=demo-c5 mise run start:worker
```

Terminal C (API shim):

```bash
OC_MODE=live OC_BASE_URL=http://127.0.0.1:4096 PORT=3001 ADMIN_PORT=3002 DBOS__APPVERSION=demo-c5 mise run start:api-shim
```

Terminal D (client helpers):

```bash
BASE=http://127.0.0.1:3001
wait_status(){ id="$1"; want="$2"; for i in $(seq 1 180); do s=$(curl -sS "$BASE/runs/$id" | jq -r .status); [ "$s" = "$want" ] && return 0; sleep 0.25; done; return 1; }
curl -sS $BASE/healthz | jq -e '.ok==true'
```

Hard rule: worker+shim `DBOS__APPVERSION` must match.

## 3) B1 Walkthrough A (Golden Product Path + Approval Gate)

Create intent/run:

```bash
I=$(curl -sS -X POST $BASE/intents -H 'content-type: application/json' \
  -d '{"goal":"demo c5","inputs":{},"constraints":{}}' | jq -r .intentId)
R=$(curl -sS -X POST $BASE/intents/$I/run -H 'content-type: application/json' \
  -d '{"traceId":"po-demo"}' | jq -r .runId)
echo "$I $R"
```

Gate must stop at `waiting_input` first (plan approval):

```bash
wait_status "$R" waiting_input
curl -sS $BASE/runs/$R | jq '{runId,workflowId,status,error,nextAction,lastStep}'
```

Approve plan:

```bash
curl -sS -X POST $BASE/runs/$R/approve-plan -H 'content-type: application/json' \
  -d '{"approvedBy":"po"}' | jq
```

Converge to success:

```bash
wait_status "$R" succeeded
curl -sS $BASE/runs/$R | jq '{status,lastStep,steps:[.steps[].stepId],retryCount}'
```

Dual read invariant (`runId` or `workflowId`):

```bash
W=$(curl -sS $BASE/runs/$R | jq -r .workflowId)
test "$W" = "$I"
curl -sS $BASE/runs/$W | jq -e --arg r "$R" '.runId==$r'
```

## 4) B2 Walkthrough B (Fail-Closed API)

Malformed JSON:

```bash
curl -sS -o /tmp/t31.json -w '%{http_code}\n' -X POST $BASE/intents -H 'content-type: application/json' -d '{bad'
cat /tmp/t31.json
```

Bad run schema:

```bash
curl -sS -o /tmp/t32.json -w '%{http_code}\n' -X POST $BASE/intents/$I/run -H 'content-type: application/json' -d '{"unknown":1}'
cat /tmp/t32.json
```

Queue policy hard-fail + zero writes:

```bash
I_BAD=$(curl -sS -X POST $BASE/intents -H 'content-type: application/json' -d '{"goal":"caps","inputs":{},"constraints":{}}' | jq -r .intentId)
curl -sS -o /tmp/t33.json -w '%{http_code}\n' -X POST $BASE/intents/$I_BAD/run -H 'content-type: application/json' \
  -d '{"recipeName":"sandbox-default","workload":{"concurrency":999,"steps":1,"sandboxMinutes":1}}'
cat /tmp/t33.json
docker compose exec -T db psql -tA -U postgres -d app_local -c "SELECT COUNT(*) FROM app.runs WHERE intent_id='${I_BAD}';"
```

Bad approve payload:

```bash
curl -sS -o /tmp/t34.json -w '%{http_code}\n' -X POST $BASE/runs/$R/approve-plan -H 'content-type: application/json' -d '{"notes":"missing approvedBy"}'
cat /tmp/t34.json
```

## 5) B3 Walkthrough C (HITL + Retry/Repair)

HITL lane (`ask`):

```bash
I_ASK=$(curl -sS -X POST $BASE/intents -H 'content-type: application/json' -d '{"goal":"ask user","inputs":{},"constraints":{}}' | jq -r .intentId)
R_ASK=$(curl -sS -X POST $BASE/intents/$I_ASK/run -H 'content-type: application/json' -d '{}' | jq -r .runId)
wait_status "$R_ASK" waiting_input
curl -sS -X POST $BASE/runs/$R_ASK/events -H 'content-type: application/json' -d '{"type":"input","payload":{"answer":"42"}}' | jq
curl -sS -X POST $BASE/runs/$R_ASK/approve-plan -H 'content-type: application/json' -d '{"approvedBy":"qa"}' | jq
wait_status "$R_ASK" succeeded
```

Terminal failure lane (`fail me`) -> deterministic repair envelope:

```bash
I_FAIL=$(curl -sS -X POST $BASE/intents -H 'content-type: application/json' -d '{"goal":"fail me","inputs":{},"constraints":{}}' | jq -r .intentId)
R_FAIL=$(curl -sS -X POST $BASE/intents/$I_FAIL/run -H 'content-type: application/json' -d '{}' | jq -r .runId)
wait_status "$R_FAIL" waiting_input
curl -sS -X POST $BASE/runs/$R_FAIL/approve-plan -H 'content-type: application/json' -d '{"approvedBy":"qa"}' | jq
wait_status "$R_FAIL" retries_exceeded
curl -sS $BASE/runs/$R_FAIL | jq '{status,error,retryCount,nextAction,lastStep}'
curl -sS -X POST $BASE/runs/$R_FAIL/retry | jq
```

FSM hard guard:

```bash
curl -sS -o /tmp/t35.json -w '%{http_code}\n' -X POST $BASE/runs/$R/events -H 'content-type: application/json' -d '{"type":"input","payload":{}}'
cat /tmp/t35.json
```

## 6) B4 Walkthrough D (OC Contract + Wrapper + Compiler + C5 Bugs)

Daemon contract lane:

```bash
mise run -f oc:daemon:contract
```

Wrapper/compiler/bug lanes (targeted):

```bash
mise run test:integration:mock:file -- test/integration/oc-wrapper-replay.test.ts test/integration/oc-wrapper-retry-safe.test.ts test/integration/oc-wrapper-tool-deny.test.ts test/integration/oc-retry-cache.test.ts
mise run test:integration:mock:file -- test/integration/compile-structured-output.test.ts test/integration/compile-determinism.test.ts test/integration/plan-output-schema.test.ts test/integration/plan-build-tool-deny.test.ts
mise run test:integration:mock:file -- test/integration/oc-bug-8528.test.ts test/integration/oc-bug-6396.test.ts test/integration/oc-bug-11064.test.ts
```

Policy closure:

```bash
mise run -f policy:oc-boundary
mise run -f policy:oc-config
mise run -f policy:no-parentid
```

## 7) B4 Walkthrough E (SQL-Only Replay/Exactly-Once Oracles)

No duplicate side effects:

```bash
docker compose exec -T db psql -tA -U postgres -d app_local -c "SELECT COUNT(*) FROM app.mock_receipts WHERE seen_count>1;"
```

No duplicate `op_key` rows:

```bash
docker compose exec -T db psql -U postgres -d app_local -c "SELECT op_key,COUNT(*) FROM app.opencode_calls GROUP BY op_key HAVING COUNT(*)>1;"
```

Monotonic attempts:

```bash
docker compose exec -T db psql -U postgres -d app_local -c "SELECT step_id,(output->>'attempt')::int AS attempt FROM app.run_steps WHERE run_id='${R}' ORDER BY step_id;"
```

Plan approvals persisted:

```bash
docker compose exec -T db psql -U postgres -d app_local -c "SELECT run_id,approved_by,approved_at FROM app.plan_approvals ORDER BY approved_at DESC LIMIT 5;"
```

## 8) B5 Walkthrough F (Durability + Soak)

```bash
mise run -f wf:intent:chaos
mise run -f wf:intent:chaos:soak
mise run -f sandbox:soak
PORT=3004 ADMIN_PORT=3006 mise run -f wf:crashdemo
```

Oracle: converge without duplicate effects; crashdemo keeps marks exactly-once.

## 9) B6 Walkthrough G (Release Gate)

```bash
mise run check
mise run test:e2e
mise run test:e2e:file test/e2e/plan-build-approval.test.ts
mise run test:e2e:file test/e2e/plan-approval-api.test.ts
mise run full
```

Golden refresh only when contract intentionally changes:

```bash
mise run test:golden:refresh
```

## 10) High-Value Tactical Examples

Single-file e2e during iteration:

```bash
mise run test:e2e:file test/e2e/runs-retry.test.ts
```

Prove shim black-box split:

```bash
mise run -f policy:shim-blackbox
```

Inspect daemon drift artifacts:

```bash
cat docs/contracts/opencode/agents.json | jq .
ls -1 docs/contracts/opencode/openapi-*.json | tail -n 3
```

Check daemon logs when health fails:

```bash
tail -n 120 .tmp/oc-daemon-4096.log
```

## 11) Fast Triage

`worker boot hangs`:

- OC daemon unhealthy; run `OC_SERVER_PORT=4096 mise run -f oc:daemon:health`.
- inspect `.tmp/oc-daemon-4096.log`.

`runs stuck queued`:

- worker not up, or app-version mismatch between worker/shim.

`status loops waiting_input`:

- missing `POST /runs/:id/approve-plan`.

`retry 409`:

- run not in `failed|retries_exceeded`.

`events 409`:

- run not `waiting_input`.

`queue 400`:

- expected: recipe/workload cap breach by design.

`dup receipt/op_key > 0`:

- S0 durability regression. stop release.

## 12) Completion Bar (Credible Demo)

Pass all:

1. `mise run quick`
2. Walkthrough A (`waiting_input` -> approve -> `succeeded` + dual-read)
3. Walkthrough B (deterministic `400` + zero writes on cap violation)
4. Walkthrough C (`retries_exceeded` + retry envelope)
5. Walkthrough D (OC contract/wrapper/compiler/C5 tests)
6. Walkthrough E (SQL oracles: dup=0, attempts monotonic)
7. Walkthrough F (`chaos/soak/crashdemo`)
8. Walkthrough G (`check`, `test:e2e`, `full`)

If any item fails, claim is not production-demo grade.
