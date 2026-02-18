# 003 Real-Value Split-Topology Course (As Built, 2026-02-18)

## 0) Doctrine (non-negotiable)

- `mise` only. No ad-hoc scripts as primary flow.
- SQL is truth (`app.*` + `dbos.*`), logs are hints.
- `workflowID=intentId` is the exactly-once key.
- Step IDs are fixed: `CompileST|ApplyPatchST|DecideST|ExecuteST`.
- Fail-closed API: bad JSON/schema/queue caps => deterministic `400` + zero writes.
- Soak/chaos must use `-f` (cache bypass).

## 1) Reality Envelope

Works now (real value):

- Split topology: shim enqueues/reads, worker executes.
- Deterministic run projection + dual lookup (`runId|workflowId`).
- HITL (`waiting_input` + `/events`), retry envelope, bounded recovery.
- Chaos/crash durability + duplicate-side-effect SQL oracles.
- Deterministic e2e + golden.

Intentionally partial:

- `oc:live:smoke` = contract stub, not provider integration.
- `sbx:live:smoke` = shell adapter, not microVM runtime.

## 2) Bootstrap (clean deterministic base)

```bash
mise install
mise run db:reset
mise run db:sys:reset
mise run build
mise run quick
```

## 3) Walkthrough A: Split Topology Bring-Up

Terminal A (worker):

```bash
PORT=3001 ADMIN_PORT=3002 DBOS__APPVERSION=demo-v1 mise run start:worker
```

Terminal B (shim):

```bash
PORT=3001 ADMIN_PORT=3002 DBOS__APPVERSION=demo-v1 mise run start:api-shim
```

Terminal C (probe):

```bash
BASE=http://127.0.0.1:3001
curl -sS $BASE/healthz | jq -e '.ok==true'
```

Rule: worker+shim must share `DBOS__APPVERSION`, else runs stick queued.

## 4) Walkthrough B: Happy Path, Dual Read, Stable Timeline

```bash
BASE=http://127.0.0.1:3001
I1=$(curl -sS -X POST $BASE/intents -H 'content-type: application/json' \
  -d '{"goal":"demo chain","inputs":{},"constraints":{}}' | jq -r .intentId)
R1=$(curl -sS -X POST $BASE/intents/$I1/run -H 'content-type: application/json' \
  -d '{"traceId":"po-demo","recipeName":"compile-default","workload":{"concurrency":1,"steps":2,"sandboxMinutes":1}}' \
  | jq -r .runId)
W1=$(curl -sS $BASE/runs/$R1 | jq -r .workflowId)
echo "$I1 $R1 $W1"
test "$W1" = "$I1"
```

Poll to terminal:

```bash
for i in $(seq 1 120); do
  S=$(curl -sS $BASE/runs/$W1 | jq -r .status)
  [ "$S" = "succeeded" ] && break
  sleep 0.25
done
curl -sS $BASE/runs/$W1 | jq '{runId,workflowId,status,lastStep,retryCount,steps:[.steps[].stepId]}'
curl -sS $BASE/runs/$R1 | jq -e --arg w "$W1" '.workflowId==$w'
```

Expected:

- `status=succeeded`
- `steps` contains `CompileST,ApplyPatchST,DecideST,ExecuteST`
- read-by-`runId` and read-by-`workflowId` both work

## 5) Walkthrough C: Exactly-Once Under Parallel Start

```bash
BASE=http://127.0.0.1:3001
I2=$(curl -sS -X POST $BASE/intents -H 'content-type: application/json' \
  -d '{"goal":"idempotency demo","inputs":{},"constraints":{}}' | jq -r .intentId)
for n in $(seq 1 10); do
  curl -sS -X POST $BASE/intents/$I2/run -H 'content-type: application/json' -d '{"traceId":"idem"}' &
done
wait
docker compose exec -T db psql -U postgres -d app_local -c \
  "SELECT workflow_id,COUNT(*) FROM app.runs WHERE workflow_id='${I2}' GROUP BY workflow_id;"
```

Expected row count is `1`.

## 6) Walkthrough D: Fail-Closed API (JSON/Schema/Queue Caps)

Bad JSON:

```bash
curl -sS -o /tmp/wd-bad-json.json -w '%{http_code}\n' -X POST $BASE/intents \
  -H 'content-type: application/json' -d '{bad'
cat /tmp/wd-bad-json.json
```

Bad intent schema:

```bash
curl -sS -o /tmp/wd-bad-intent.json -w '%{http_code}\n' -X POST $BASE/intents \
  -H 'content-type: application/json' -d '{"inputs":{},"constraints":{}}'
cat /tmp/wd-bad-intent.json
```

Bad run schema:

```bash
I_BAD_SCHEMA=$(curl -sS -X POST $BASE/intents -H 'content-type: application/json' \
  -d '{"goal":"schema","inputs":{},"constraints":{}}' | jq -r .intentId)
curl -sS -o /tmp/wd-bad-run.json -w '%{http_code}\n' -X POST $BASE/intents/$I_BAD_SCHEMA/run \
  -H 'content-type: application/json' -d '{"unknownField":"x"}'
cat /tmp/wd-bad-run.json
```

Queue cap violation (`sandbox-default.max_concurrency=20`):

```bash
I_CAP=$(curl -sS -X POST $BASE/intents -H 'content-type: application/json' \
  -d '{"goal":"caps bad","inputs":{},"constraints":{}}' | jq -r .intentId)
curl -sS -o /tmp/wd-cap.json -w '%{http_code}\n' -X POST $BASE/intents/$I_CAP/run \
  -H 'content-type: application/json' \
  -d '{"recipeName":"sandbox-default","workload":{"concurrency":999,"steps":1,"sandboxMinutes":1}}'
cat /tmp/wd-cap.json
docker compose exec -T db psql -tA -U postgres -d app_local -c \
  "SELECT COUNT(*) FROM app.runs WHERE intent_id='${I_CAP}';"
```

Expected:

- all HTTP codes are `400`
- queue case returns `code=queue_policy_violation`
- final DB count is `0`

## 7) Walkthrough E: HITL Lane (`waiting_input -> events -> succeeded`)

```bash
I3=$(curl -sS -X POST $BASE/intents -H 'content-type: application/json' \
  -d '{"goal":"ask user","inputs":{},"constraints":{}}' | jq -r .intentId)
R3=$(curl -sS -X POST $BASE/intents/$I3/run -H 'content-type: application/json' -d '{}' | jq -r .runId)
for i in $(seq 1 120); do
  S=$(curl -sS $BASE/runs/$R3 | jq -r .status)
  [ "$S" = "waiting_input" ] && break
  sleep 0.25
done
curl -sS $BASE/runs/$R3 | jq '{status,lastStep,nextAction}'
curl -sS -X POST $BASE/runs/$R3/events -H 'content-type: application/json' \
  -d '{"type":"input","payload":{"answer":"42"}}' | jq
for i in $(seq 1 120); do
  S=$(curl -sS $BASE/runs/$R3 | jq -r .status)
  [ "$S" = "succeeded" ] && break
  sleep 0.25
done
curl -sS $BASE/runs/$R3 | jq '{status,steps:[.steps[].stepId]}'
```

FSM guard example (send too early):

```bash
I3B=$(curl -sS -X POST $BASE/intents -H 'content-type: application/json' \
  -d '{"goal":"ask fast","inputs":{},"constraints":{}}' | jq -r .intentId)
R3B=$(curl -sS -X POST $BASE/intents/$I3B/run -H 'content-type: application/json' -d '{}' | jq -r .runId)
curl -sS -o /tmp/wd-fsm.json -w '%{http_code}\n' -X POST $BASE/runs/$R3B/events \
  -H 'content-type: application/json' -d '{"type":"too_soon","payload":{}}'
cat /tmp/wd-fsm.json
```

Expected early-event code: `409`.

## 8) Walkthrough F: Terminal Failure + Retry Envelope

```bash
I4=$(curl -sS -X POST $BASE/intents -H 'content-type: application/json' \
  -d '{"goal":"fail me","inputs":{},"constraints":{}}' | jq -r .intentId)
R4=$(curl -sS -X POST $BASE/intents/$I4/run -H 'content-type: application/json' -d '{}' | jq -r .runId)
for i in $(seq 1 180); do
  S=$(curl -sS $BASE/runs/$R4 | jq -r .status)
  [ "$S" = "retries_exceeded" ] && break
  sleep 0.5
done
curl -sS $BASE/runs/$R4 | jq '{status,error,retryCount,nextAction,lastStep}'
curl -sS -X POST $BASE/runs/$R4/retry | jq
```

Expected envelope:

- `{"accepted":true,"newRunId":"<same run>","fromStep":"ExecuteST"}`

## 9) Walkthrough G: Legacy Crash Canary (`s1=1,s2=1`)

```bash
PORT=3004 ADMIN_PORT=3006 mise run -f wf:crashdemo
scripts/db/psql-sys.sh -c "SELECT workflow_uuid,status FROM dbos.workflow_status ORDER BY updated_at DESC LIMIT 10;"
docker compose exec -T db psql -U postgres -d app_local -c \
  "SELECT run_id,step,COUNT(*) c FROM app.marks GROUP BY run_id,step ORDER BY run_id DESC,step;"
```

Oracle: latest crash workflow reaches `SUCCESS`, marks are exactly once.

## 10) Walkthrough H: Chaos Resume (kill worker during ExecuteST)

```bash
mise run -f wf:intent:chaos
```

What it proves:

- worker kill + restart converges to `succeeded`
- completed steps are not re-run (`attempt=1`)
- duplicate receipts (`seen_count>1`) stay `0`

## 11) Walkthrough I: Throughput Soak + Replay Safety

```bash
mise run -f wf:intent:chaos:soak
mise run -f sandbox:soak
```

Post-check:

```bash
docker compose exec -T db psql -tA -U postgres -d app_local -c \
  "SELECT COUNT(*) FROM app.mock_receipts WHERE seen_count > 1;"
```

Expected: `0`.

## 12) Walkthrough J: Forensics Pack (SQL-first)

Recent run projection:

```bash
docker compose exec -T db psql -U postgres -d app_local -c \
  "SELECT id,workflow_id,status,last_step,retry_count,next_action FROM app.runs ORDER BY created_at DESC LIMIT 10;"
```

Step attempts (must be `1` on clean success):

```bash
docker compose exec -T db psql -U postgres -d app_local -c \
  "SELECT step_id,(output->>'attempt')::int AS attempt FROM app.run_steps WHERE run_id='${R1}' ORDER BY started_at;"
```

Decide envelopes:

```bash
docker compose exec -T db psql -U postgres -d app_local -c \
  "SELECT step_id,COUNT(*) FROM app.opencode_calls GROUP BY step_id ORDER BY step_id;"
```

System DB status:

```bash
scripts/db/psql-sys.sh -c "SELECT workflow_uuid,status FROM dbos.workflow_status ORDER BY created_at DESC LIMIT 10;"
```

## 13) Walkthrough K: E2E + CI-Equivalent Gates

```bash
mise run check
mise run test:e2e
mise run -f policy:shim-blackbox
mise run -f policy:wf-purity
mise run -f policy:task-sources
mise tasks deps check
```

Golden refresh (only for intentional contract change):

```bash
mise run test:golden:refresh
```

## 14) Walkthrough L: Live-Smoke Truth (don’t overclaim)

```bash
mise run oc:live:smoke
mise run sbx:live:smoke
```

Interpretation:

- OC: proves contract path/keying; not real provider correctness.
- SBX: proves shell execution path; not microVM isolation.

## 15) Operator Triage (fast path)

`/healthz` down:

```bash
curl -sS $BASE/healthz
```

If fail: worker/shim process dead or wrong port.

Runs stuck `queued`:

- worker not running, or `DBOS__APPVERSION` mismatch.

`POST /events` returns `409`:

- run not in `waiting_input`; use `goal` containing `ask`.

`POST /retry` returns `409`:

- run not in `failed|retries_exceeded`.

Unexpected cap `400`:

- inspect `recipeName/workload` vs `app.recipes` limits.

Port collisions:

```bash
mise run stop
PORT=3001 ADMIN_PORT=3002 DBOS__APPVERSION=demo-v1 mise run start:worker
PORT=3001 ADMIN_PORT=3002 DBOS__APPVERSION=demo-v1 mise run start:api-shim
```

## 16) Completion Bar (credible demo)

Pass all:

1. `mise run quick`
2. Walkthrough B (`succeeded` + dual-read)
3. Walkthrough D (`400` + zero writes)
4. Walkthrough E (`waiting_input` then `succeeded`)
5. Walkthrough F (`retries_exceeded` + retry envelope)
6. `mise run -f wf:intent:chaos`
7. `mise run -f sandbox:soak`
8. `mise run test:e2e`

If any fail, claim is not demo-grade.
