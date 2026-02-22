# 008 Spec-08 Live HITL Gates Operator Field Course (As-Built 2026-02-22)

## 0) Non-Negotiable Stance

- Use this to extract value now, not to learn architecture.
- Truth oracle: SQL (`app.*`, `dbos.workflow_status`, `dbos.workflow_events`), not logs/UI.
- Priority order: contract > deterministic fail-closed > SQL exactly-once > throughput/style.
- Product run identity: `workflowID=intentId`.
- Product step set is fixed: `CompileST|ApplyPatchST|DecideST|ExecuteST`.
- HITL ABI is frozen: `ui:<g>`, `ui:<g>:result`, `decision:<g>`, `ui:<g>:audit`; topics `human:<g>|sys:<k>`.
- Reply/event ingress is fail-closed: bad JSON/schema/policy -> `400` + zero writes.
- Dedupe drift rule: same `dedupeKey` + different payload/topic -> `409`.
- Queue law: parent `intentQ` only; child fanout `sbxQ` only.
- Partition law: with `SBX_QUEUE_PARTITION=true` (default), parent start requires non-blank `queuePartitionKey`.
- Signoff law: `mise run quick && mise run check && mise run full` (no waiver by retries).

## 1) Value You Actually Get

- Live gate APIs: list/get/reply + external receiver + stream adjunct.
- Deterministic human-in-loop lifecycle: prompt -> result -> decision -> audit.
- SQL-provable exactly-once interaction ledger (`app.human_interactions`).
- Restart-safe gate behavior (no phantom duplicate prompts).
- Split topology parity (worker + api-shim).
- Built-in chaos/load/release proof lanes.

## 2) Fast Tracks

- PO 10m demo: `L00 -> L01 -> L02 -> L03 -> L04 -> L05 -> L23`.
- QA fail-closed/x-once: `L00 -> L01 -> L06..L18 -> L20 -> L24`.
- FDE release rehearsal: `L00 -> L01 -> L03 -> L08 -> L19 -> L21 -> L22 -> L25`.

## 3) One-Time Bootstrap

```bash
MISE_TASK_OUTPUT=prefix mise install
mise run db:up
mise run db:sys:reset
mise run db:reset
mise run build
```

Pass condition: no command fails.

## 4) Shell Kit (Copy Once)

```bash
BASE=http://127.0.0.1:3001
term='SUCCESS|ERROR|CANCELLED|MAX_RECOVERY_ATTEMPTS_EXCEEDED'

wait_terminal(){ wid="$1"; for i in $(seq 1 300); do s=$(curl -sS "$BASE/api/runs/$wid" | jq -r '.status // empty'); echo "$s" | grep -Eq "$term" && return 0; sleep 1; done; return 1; }
wait_next(){ wid="$1"; want="$2"; for i in $(seq 1 300); do n=$(curl -sS "$BASE/api/runs/$wid" | jq -r '.nextAction // empty'); [ "$n" = "$want" ] && return 0; sleep 1; done; return 1; }
wait_gate(){ wid="$1"; for i in $(seq 1 120); do g=$(curl -sS "$BASE/api/runs/$wid/gates" | jq -r '.[0].gateKey // empty'); [ -n "$g" ] && { echo "$g"; return 0; }; sleep 1; done; return 1; }
sql_app(){ scripts/db/psql-app.sh -c "$1"; }
sql_sys(){ scripts/db/psql-sys.sh -c "$1"; }
```

## 5) Runtime Lanes

- Monolith (fastest lab): `OC_MODE=replay SBX_MODE=mock SBX_QUEUE_PARTITION=true PORT=3001 ADMIN_PORT=3002 mise run start`.
- Split parity (2 terminals, same `DBOS__APPVERSION`):
- Worker: `OC_MODE=replay SBX_MODE=mock SBX_QUEUE_PARTITION=true DBOS__APPVERSION=v1 PORT=3011 ADMIN_PORT=3012 mise run start:worker`
- Shim: `OC_MODE=replay SBX_MODE=mock SBX_QUEUE_PARTITION=true DBOS__APPVERSION=v1 PORT=3011 ADMIN_PORT=3013 mise run start:api-shim`

## 6) Labs (Dense, Real, Repeatable)

### L00 Health

```bash
curl -sS "$BASE/healthz" | jq -e '.ok==true'
```

### L01 Create Intent + Run

```bash
INTENT=$(curl -sS -X POST "$BASE/api/intents" -H 'content-type: application/json' \
  -d '{"goal":"spec08 gate demo","inputs":{},"constraints":{}}' | jq -r .intentId)

WID=$(curl -sS -X POST "$BASE/api/runs" -H 'content-type: application/json' \
  -d "{\"intentId\":\"$INTENT\",\"queueName\":\"intentQ\",\"queuePartitionKey\":\"tenant-008\",\"recipeName\":\"compile-default\",\"workload\":{\"concurrency\":1,\"steps\":1,\"sandboxMinutes\":1}}" \
  | jq -r .workflowID)

echo "$INTENT $WID"
curl -sS "$BASE/api/runs/$WID" | jq '{workflowID,status,nextAction,lastStep}'
```

### L02 Gate Discovery

```bash
wait_next "$WID" APPROVE_PLAN
GATE=$(wait_gate "$WID")
echo "$GATE"
curl -sS "$BASE/api/runs/$WID/gates" | jq
curl -sS "$BASE/api/runs/$WID/gates/$GATE?timeoutS=3" | jq '{gateKey,state,deadlineAt,prompt:(.prompt.schemaVersion)}'
```

Expect: `state=PENDING`.

### L03 Primary Reply Path (yes)

```bash
DEDUPE="manual-$WID-yes-1"
curl -sS -X POST "$BASE/api/runs/$WID/gates/$GATE/reply" -H 'content-type: application/json' \
  -d "{\"payload\":{\"choice\":\"yes\",\"rationale\":\"operator-yes\"},\"dedupeKey\":\"$DEDUPE\"}" | jq

curl -sS "$BASE/api/runs/$WID/gates/$GATE" | jq '{state,result}'
wait_terminal "$WID"
curl -sS "$BASE/api/runs/$WID" | jq '{status,nextAction,lastStep,error}'
```

Expect: gate `RECEIVED`; run terminal.

### L04 Idempotent Replay (same dedupe + same payload)

```bash
curl -sS -X POST "$BASE/api/runs/$WID/gates/$GATE/reply" -H 'content-type: application/json' \
  -d "{\"payload\":{\"choice\":\"yes\",\"rationale\":\"operator-yes\"},\"dedupeKey\":\"$DEDUPE\"}" | jq
```

Expect: still `200`; no duplicate side-effect.

### L05 Dedupe Drift Conflict (same dedupe + different payload)

```bash
curl -sS -o /tmp/008-dedupe-conflict.out -w '%{http_code}\n' \
  -X POST "$BASE/api/runs/$WID/gates/$GATE/reply" -H 'content-type: application/json' \
  -d "{\"payload\":{\"choice\":\"no\"},\"dedupeKey\":\"$DEDUPE\"}"
cat /tmp/008-dedupe-conflict.out
```

Expect: `409`.

### L06 Reject Scenario (explicit no)

```bash
I2=$(curl -sS -X POST "$BASE/api/intents" -H 'content-type: application/json' -d '{"goal":"spec08 reject demo","inputs":{},"constraints":{}}' | jq -r .intentId)
W2=$(curl -sS -X POST "$BASE/api/runs" -H 'content-type: application/json' \
  -d "{\"intentId\":\"$I2\",\"queueName\":\"intentQ\",\"queuePartitionKey\":\"tenant-008\",\"recipeName\":\"compile-default\",\"workload\":{\"concurrency\":1,\"steps\":1,\"sandboxMinutes\":1}}" | jq -r .workflowID)
G2=$(wait_gate "$W2")
curl -sS -X POST "$BASE/api/runs/$W2/gates/$G2/reply" -H 'content-type: application/json' \
  -d "{\"payload\":{\"choice\":\"no\",\"rationale\":\"policy-fail\"},\"dedupeKey\":\"manual-$W2-no-1\"}" | jq
wait_terminal "$W2"
curl -sS "$BASE/api/runs/$W2" | jq '{status,nextAction,error}'
```

Expect: terminal non-success path is explicit and durable.

### L07 Timeout + Escalation Scenario

```bash
I3=$(curl -sS -X POST "$BASE/api/intents" -H 'content-type: application/json' -d '{"goal":"timeout test","inputs":{},"constraints":{}}' | jq -r .intentId)
W3=$(curl -sS -X POST "$BASE/api/runs" -H 'content-type: application/json' \
  -d "{\"intentId\":\"$I3\",\"queueName\":\"intentQ\",\"queuePartitionKey\":\"tenant-008\",\"recipeName\":\"compile-default\",\"workload\":{\"concurrency\":1,\"steps\":1,\"sandboxMinutes\":1}}" | jq -r .workflowID)
G3=$(wait_gate "$W3")
sleep 4
curl -sS "$BASE/api/runs/$W3/gates/$G3" | jq '{state,result}'
sql_sys "SELECT workflow_uuid,status,queue_name FROM dbos.workflow_status WHERE workflow_uuid LIKE 'esc:$W3:%' ORDER BY updated_at DESC LIMIT 5;"
```

Expect: gate `TIMED_OUT`; escalation workflow id starts with `esc:$W3:`.

### L08 Late Reply After Timeout

```bash
curl -sS -X POST "$BASE/api/runs/$W3/gates/$G3/reply" -H 'content-type: application/json' \
  -d "{\"payload\":{\"choice\":\"yes\",\"rationale\":\"late\"},\"dedupeKey\":\"late-$W3-1\"}" | jq
curl -sS "$BASE/api/runs/$W3/gates/$G3" | jq '{state,result}'
```

Expect: gate remains `TIMED_OUT`.

### L09 Legacy Compat Bridge (`/approve-plan`)

```bash
I4=$(curl -sS -X POST "$BASE/api/intents" -H 'content-type: application/json' -d '{"goal":"compat approve-plan demo","inputs":{},"constraints":{}}' | jq -r .intentId)
W4=$(curl -sS -X POST "$BASE/api/runs" -H 'content-type: application/json' \
  -d "{\"intentId\":\"$I4\",\"queueName\":\"intentQ\",\"queuePartitionKey\":\"tenant-008\",\"recipeName\":\"compile-default\",\"workload\":{\"concurrency\":1,\"steps\":1,\"sandboxMinutes\":1}}" | jq -r .workflowID)
wait_next "$W4" APPROVE_PLAN
curl -sS -X POST "$BASE/api/runs/$W4/approve-plan" -H 'content-type: application/json' \
  -d '{"approvedBy":"compat","notes":"bridge"}' | jq
wait_terminal "$W4"
curl -sS "$BASE/api/runs/$W4" | jq '{status,nextAction,lastStep,error}'
```

### L10 External Receiver (`/api/events/hitl`)

```bash
I5=$(curl -sS -X POST "$BASE/api/intents" -H 'content-type: application/json' -d '{"goal":"webhook gate demo","inputs":{},"constraints":{}}' | jq -r .intentId)
W5=$(curl -sS -X POST "$BASE/api/runs" -H 'content-type: application/json' \
  -d "{\"intentId\":\"$I5\",\"queueName\":\"intentQ\",\"queuePartitionKey\":\"tenant-008\",\"recipeName\":\"compile-default\",\"workload\":{\"concurrency\":1,\"steps\":1,\"sandboxMinutes\":1}}" | jq -r .workflowID)
G5=$(wait_gate "$W5")
curl -sS -X POST "$BASE/api/events/hitl" -H 'content-type: application/json' \
  -d "{\"workflowId\":\"$W5\",\"gateKey\":\"$G5\",\"topic\":\"human:$G5\",\"payload\":{\"choice\":\"yes\",\"rationale\":\"webhook\"},\"dedupeKey\":\"evt-$W5-1\",\"origin\":\"webhook-ci\"}" | jq
```

Expect: `{"ok":true}`.

### L11 Stream Adjunct (NDJSON)

```bash
curl -Nsf "$BASE/api/runs/$W5/stream/status" | head -n 8
```

Rule: stream is UX channel only; SQL/events remain canonical.

### L12 Split Topology Parity Smoke

```bash
BASE2=http://127.0.0.1:3011
curl -sS "$BASE2/healthz"
I6=$(curl -sS -X POST "$BASE2/api/intents" -H 'content-type: application/json' -d '{"goal":"split parity demo","inputs":{},"constraints":{}}' | jq -r .intentId)
W6=$(curl -sS -X POST "$BASE2/api/runs" -H 'content-type: application/json' \
  -d "{\"intentId\":\"$I6\",\"queueName\":\"intentQ\",\"queuePartitionKey\":\"tenant-008\",\"recipeName\":\"compile-default\",\"workload\":{\"concurrency\":1,\"steps\":1,\"sandboxMinutes\":1}}" | jq -r .workflowID)
G6=$(for i in $(seq 1 120); do g=$(curl -sS "$BASE2/api/runs/$W6/gates" | jq -r '.[0].gateKey // empty'); [ -n "$g" ] && { echo "$g"; break; }; sleep 1; done)
curl -sS -X POST "$BASE2/api/runs/$W6/gates/$G6/reply" -H 'content-type: application/json' \
  -d "{\"payload\":{\"choice\":\"yes\"},\"dedupeKey\":\"split-$W6-1\"}" | jq
```

### L13 Fail-Closed: Invalid JSON

```bash
curl -sS -o /tmp/008-bad-json.out -w '%{http_code}\n' \
  -X POST "$BASE/api/events/hitl" -H 'content-type: application/json' -d '{bad'
cat /tmp/008-bad-json.out
```

Expect: `400`.

### L14 Fail-Closed: Invalid Schema

```bash
curl -sS -o /tmp/008-bad-schema.out -w '%{http_code}\n' \
  -X POST "$BASE/api/events/hitl" -H 'content-type: application/json' -d '{"workflowId":"x"}'
cat /tmp/008-bad-schema.out
```

Expect: `400`.

### L15 Fail-Closed: Missing `dedupeKey`

```bash
B=$(scripts/db/psql-app.sh -t -A -c "select count(*) from app.human_interactions where workflow_id='$W5'" | xargs)
curl -sS -o /tmp/008-missing-dedupe.out -w '%{http_code}\n' \
  -X POST "$BASE/api/runs/$W5/gates/$G5/reply" -H 'content-type: application/json' -d '{"payload":{"choice":"yes"}}'
A=$(scripts/db/psql-app.sh -t -A -c "select count(*) from app.human_interactions where workflow_id='$W5'" | xargs)
echo "code=$(cat /tmp/008-missing-dedupe.out) before=$B after=$A"
```

Expect: `400` and `before==after`.

### L16 Fail-Closed: Bad `gateKey` Format

```bash
curl -sS -o /tmp/008-bad-gate.out -w '%{http_code}\n' \
  -X POST "$BASE/api/runs/$W5/gates/BAD_KEY/reply" -H 'content-type: application/json' \
  -d '{"payload":{"choice":"yes"},"dedupeKey":"bad-gate-1"}'
cat /tmp/008-bad-gate.out
```

Expect: `400`.

### L17 Fail-Closed: Missing Run / Missing Gate

```bash
curl -sS -o /tmp/008-missing-run.out -w '%{http_code}\n' \
  -X POST "$BASE/api/runs/missing-run/gates/$G5/reply" -H 'content-type: application/json' \
  -d '{"payload":{"choice":"yes"},"dedupeKey":"mr-1"}'

curl -sS -o /tmp/008-missing-gate.out -w '%{http_code}\n' \
  -X POST "$BASE/api/runs/$W5/gates/missing-gate/reply" -H 'content-type: application/json' \
  -d '{"payload":{"choice":"yes"},"dedupeKey":"mg-1"}'
```

Expect: both `404`.

### L18 Fail-Closed: Gate GET Query Bounds

```bash
curl -sS -o /tmp/008-gq-1.out -w '%{http_code}\n' "$BASE/api/runs/$W5/gates/$G5?timeoutS=abc"
curl -sS -o /tmp/008-gq-2.out -w '%{http_code}\n' "$BASE/api/runs/$W5/gates/$G5?timeoutS=99"
cat /tmp/008-gq-1.out /tmp/008-gq-2.out
```

Expect: both `400`.

### L19 Fail-Closed: Topic/Gate Mismatch

```bash
curl -sS -o /tmp/008-topic-mismatch.out -w '%{http_code}\n' \
  -X POST "$BASE/api/events/hitl" -H 'content-type: application/json' \
  -d "{\"workflowId\":\"$W5\",\"gateKey\":\"$G5\",\"topic\":\"human:wrong\",\"payload\":{\"choice\":\"yes\"},\"dedupeKey\":\"tm-1\",\"origin\":\"external\"}"
cat /tmp/008-topic-mismatch.out
```

Expect: `409`.

### L20 SQL Oracle Pack (x-once + integrity)

```bash
sql_app "SELECT id,workflow_id,status,last_step,next_action,retry_count,error FROM app.runs ORDER BY created_at DESC LIMIT 20;"
sql_app "SELECT run_id,step_id,attempt,count(*) c FROM app.run_steps GROUP BY run_id,step_id,attempt HAVING count(*)>1;"
sql_app "SELECT run_id,step_id,task_key,attempt,idx,count(*) c FROM app.artifacts GROUP BY run_id,step_id,task_key,attempt,idx HAVING count(*)>1;"
sql_app "SELECT workflow_id,gate_key,topic,dedupe_key,count(*) c FROM app.human_interactions GROUP BY workflow_id,gate_key,topic,dedupe_key HAVING count(*)>1;"
sql_sys "SELECT workflow_uuid,key,count(*) c FROM dbos.workflow_events WHERE key LIKE 'decision:%' GROUP BY workflow_uuid,key HAVING count(*)>1;"
sql_app "SELECT origin,count(*) FROM app.human_interactions GROUP BY origin ORDER BY count(*) DESC;"
sql_app "SELECT count(*) AS bad_hash FROM app.human_interactions WHERE payload_hash !~ '^[a-f0-9]{64}$';"
sql_sys "SELECT workflow_uuid,key,count(*) c FROM dbos.workflow_events WHERE key LIKE 'ui:%' AND key NOT LIKE '%:result' AND key NOT LIKE '%:audit' GROUP BY workflow_uuid,key HAVING count(*)>1;"
```

Expected zero sets:

- dup `run_steps` = 0
- dup `artifacts` grouped by `(run_id,step_id,task_key,attempt,idx)` = 0
- dup `human_interactions` tuple = 0
- dup `decision:*` = 0
- dup prompt key (`ui:*` non-result/non-audit) = 0
- `bad_hash=0`

### L21 HITL Automation Bundle (targeted)

```bash
mise run test:integration:mock:file test/integration/hitl-gate-api.test.ts
mise run test:integration:mock:file test/integration/hitl-error-handling.test.ts
mise run test:integration:mock:file test/integration/hitl-decision.test.ts
mise run test:integration:mock:file test/integration/hitl-timeout-escalation.test.ts
mise run test:integration:mock:file test/integration/hitl-reply-dedupe.test.ts
mise run test:integration:mock:file test/integration/hitl-c5-proofs.test.ts
```

### L22 Chaos Matrix + E2E Slice

```bash
mise run test:integration:hitl:c6
mise run test:e2e:file test/e2e/plan-approval-api.test.ts
mise run test:e2e:file test/e2e/api-shim.test.ts
mise run test:e2e:file test/e2e/run-view-golden.test.ts
```

### L23 Load + Burst + Soak

```bash
mise run hitl:load:1k
jq '{ready:.waiting.readyCount,maxWaitingLocks:.pressure.maxWaitingLocks,cadenceMs:.polling.cadenceMs}' .tmp/hitl-load-1k-report.json

mise run hitl:burst:soak
jq '.burst | {succeeded:.final.succeeded,errors:.final.errors,dupDecisions:.decisions.duplicateDecisionKeys,interactionRows:.interactions.totalRows,expected:.interactions.expectedDistinct}' .tmp/hitl-burst-reply-report.json

HITL_SOAK_TEST_N=120 mise run -f test:soak:hitl
```

### L24 Policy + Gate Trilogy

```bash
mise run policy:hitl-abi
mise run policy:hitl-event-abi
mise run policy:hitl-correctness
mise run quick
mise run check
mise run full
mise tasks deps check
```

Ship rule: any fail => `NO_GO`.

### L25 Live Integration Signoff Lane

Prereq: valid live OC + live SBX credentials/config.

```bash
OC_MODE=live OC_STRICT_MODE=1 mise run oc:live:smoke
SBX_MODE=live mise run sbx:live:smoke
mise run full
```

## 7) Triage Order (When Something Breaks)

- `GET /healthz`.
- `GET /api/runs/:wid`, `GET /api/runs/:wid/gates`, `GET /api/runs/:wid/gates/:gateKey`.
- `app.runs`.
- `app.run_steps`, `app.artifacts`, `app.human_interactions`.
- `dbos.workflow_status`, `dbos.workflow_events`.
- Logs last.

## 8) Hard “Don’t”

- Don’t use logs as proof.
- Don’t “fix” with retries.
- Don’t bypass gates with ad-hoc lanes.
- Don’t run parent jobs on `sbxQ`.
- Don’t omit `queuePartitionKey` when partition is on.
- Don’t treat stream output as source-of-truth.

## 9) Release Snapshot (Recorded)

- `spec-0/08/release-decision.json` (dated `2026-02-21`) is `GO/SHIP`.
- Evidence files: `.tmp/hitl-load-1k-report.json`, `.tmp/hitl-burst-reply-report.json`, `.tmp/hitl-c7-sql-evidence.json`, `.tmp/mise-{quick,check,full}.log`.
- Rollback trigger: any duplicate in `run_steps|artifacts|human_interactions|decision keys`.
- Rollback trigger: burst/load yielding `500` or PG `53300` under bounded concurrency.
