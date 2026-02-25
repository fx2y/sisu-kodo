# 011 Spec-11 Live No-Fraud Operator Course (As-Built 2026-02-24)

## 0) Doctrine (strict; no exceptions)

- This is a field manual, not product copy.
- Truth order: `app.* SQL -> dbos.workflow_status/events -> API JSON -> UI -> logs(last)`.
- Priority: `contract > deterministic fail-closed > SQL x-once > throughput/style`.
- Canonical start is `POST /api/run`. `/api/runs` is compat only.
- Error lattice only: `400 malformed/schema/policy`, `404 missing`, `409 drift/illegal`, `500 unexpected`.
- Run identity: `intentHash=sha256(canon(intent))`, `workflowID=intentId=ih_<hash>`.
- Queue law: parent `intentQ`; fanout child `sbxQ`; partition key required when partition enabled (default true).
- HITL law: reply/event require `origin`; x-once key `(workflow,gate,topic,dedupe)`; drift => `409`.
- Ops law: exact six workflow ops endpoints (`list|get|steps|cancel|resume|fork`).
- Release law: any red in `quick|check|full|deps` => `NO_GO`.

## 1) Reality Envelope (ship vs drift)

Shipped value now:

- Canonical `/api/run` with hash-idempotent replay + tuple drift `409`.
- Split topology (`api-shim` + worker) with shared `DBOS__APPVERSION`.
- HITL gate APIs + external HITL event ingress + x-once SQL ledger.
- Ops exact-six + queue depth + OPS artifacts.
- Repro pack (`scripts/repro-pack.ts`) with app + dbos parent/child scope.
- Throughput/fairness/rate/priority/budget/template/k6 proof lanes (backend tests).
- Signoff slice hardening improved (semantic x1 checks, false-green downgrade, client seam typed errors).

Known drifts (do not mis-sell):

- Run Console tabs/copy have drift (`T1,T3,T5,T39`); proof deep-link fallback exists.
- HITL inbox deep-link gate focus not wired (`T4`).
- Budget editor merged-effective preview is decorative (`T2`).
- Proof/Throughput boards contain unasserted/heuristic areas (`T10-T14,T17-T20,T38`).
- Recipe board import/export/start UX partial (`T21`); Patch panel omits guard detail (`T22,T23`).
- Signoff closure blocked (`T40`) until `T24,T28,T32,T33,T35` close with proofs.

Use rule: UI is demo surface; API+SQL are release oracles.

## 2) Tracks (pick one)

- PO (12-15m): `L00 -> L01 -> L02 -> L10 -> L14 -> L20 -> L30`.
- QA (40-60m): `L00 -> L01 -> L11 -> L12 -> L13 -> L15 -> L16 -> L30`.
- FDE (60-90m): `L00 -> L01 -> L03 -> L17 -> L18 -> L19 -> L21 -> L30`.

## 3) L00 Bootstrap (deterministic base)

```bash
export BASE=http://127.0.0.1:3001
export APPV=spec11-tut-v1
export OC_MODE=replay SBX_MODE=mock SBX_PROVIDER=e2b
export WORKFLOW_RUNTIME_MODE=api-shim SBX_QUEUE_PARTITION=true

MISE_TASK_OUTPUT=prefix mise install
mise run db:up
mise run db:sys:reset && mise run db:reset && mise run db:migrate
mise run build
```

Sanity:

```bash
curl -sf "$BASE/healthz" | jq .
curl -sf "$BASE/api/ops/queue-depth?limit=5" | jq .
scripts/db/psql-app.sh -c 'select 1'
scripts/db/psql-sys.sh -c 'select 1'
```

## 4) L01 Split Runtime Bring-Up (required posture)

Terminal A:

```bash
PORT=3001 ADMIN_PORT=3002 DBOS__APPVERSION="$APPV" \
OC_MODE="$OC_MODE" SBX_MODE="$SBX_MODE" SBX_PROVIDER="$SBX_PROVIDER" \
WORKFLOW_RUNTIME_MODE="$WORKFLOW_RUNTIME_MODE" SBX_QUEUE_PARTITION="$SBX_QUEUE_PARTITION" \
mise run start:worker
```

Terminal B:

```bash
PORT=3001 ADMIN_PORT=3003 DBOS__APPVERSION="$APPV" \
OC_MODE="$OC_MODE" SBX_MODE="$SBX_MODE" SBX_PROVIDER="$SBX_PROVIDER" \
WORKFLOW_RUNTIME_MODE="$WORKFLOW_RUNTIME_MODE" SBX_QUEUE_PARTITION="$SBX_QUEUE_PARTITION" \
mise run start:api-shim
```

Hard check:

```bash
curl -sf "$BASE/healthz" | jq .
scripts/db/psql-sys.sh -c "select workflow_uuid,application_version from dbos.workflow_status order by created_at desc limit 5;"
```

## 5) L02 UI Board Walkthrough (operator shell)

Open:

- `/` (Run Console)
- `/?board=hitl-inbox`
- `/?board=ops`
- `/?board=throughput`
- `/?board=recipe`
- `/?board=signoff`

Run tabs:

- `/?wid=<wid>&board=run&tab=timeline`
- `/?wid=<wid>&board=run&tab=gate`
- `/?wid=<wid>&board=run&tab=artifacts`
- `/?wid=<wid>&board=run&tab=patches`
- `/?wid=<wid>&board=run&tab=proof` (known drift `T5`: may fallback; click tab manually)

## 6) L03 Shell Kit (copy once)

```bash
term='SUCCESS|ERROR|CANCELLED|waiting_input|WAITING_INPUT'
sql_app(){ scripts/db/psql-app.sh -c "$1"; }
sql_sys(){ scripts/db/psql-sys.sh -c "$1"; }
wait_term(){ wid="$1"; for i in $(seq 1 240); do s=$(curl -sS "$BASE/api/runs/$wid" | jq -r '.status // empty'); echo "$s" | grep -Eq "$term" && { echo "$s"; return 0; }; sleep 0.5; done; return 1; }
wait_next(){ wid="$1"; want="$2"; for i in $(seq 1 240); do n=$(curl -sS "$BASE/api/runs/$wid" | jq -r '.nextAction // empty'); [ "$n" = "$want" ] && return 0; sleep 0.5; done; return 1; }
wait_gate(){ wid="$1"; for i in $(seq 1 240); do g=$(curl -sS "$BASE/api/runs/$wid/gates" | jq -r '.[0].gateKey // empty'); [ -n "$g" ] && { echo "$g"; return 0; }; sleep 0.5; done; return 1; }
```

## 7) L10 Canonical `/api/run` Happy Path (S01)

Resolve active recipe ref:

```bash
R=$(scripts/db/psql-app.sh -Atc "select rv.id||'@'||rv.v from app.recipe_versions rv join app.recipes r on r.id=rv.id and r.active_v=rv.v order by rv.created_at desc limit 1")
RID=${R%@*}; RV=${R#*@}; echo "$RID@$RV"
```

Build payload:

```bash
B=$(jq -nc --arg id "$RID" --arg v "$RV" '{recipeRef:{id:$id,v:$v},formData:{goal:"spec11 tutorial",tenant:"acme"},opts:{queuePartitionKey:"tenant-acme",lane:"interactive"}}')
echo "$B" | jq .
```

Start:

```bash
curl -sS -X POST "$BASE/api/run" -H 'content-type: application/json' -d "$B" \
  | tee /tmp/spec11.run.json | jq '{workflowID,status,intentHash,recipeRef,recipeHash}'
W=$(jq -r .workflowID /tmp/spec11.run.json); echo "$W"
```

Observe:

```bash
curl -sS "$BASE/api/runs/$W" | jq '{workflowID,status,nextAction,lastStep,retryCount,error}'
curl -sS "$BASE/api/runs/$W/steps" | jq 'map({stepID,attempt,status,phase})'
```

SQL proof:

```bash
sql_app "select workflow_id,status,intent_hash,recipe_id,recipe_v,recipe_hash,queue_partition_key from app.runs where workflow_id='$W';"
sql_app "select step_id,attempt,phase from app.run_steps where run_id=(select id from app.runs where workflow_id='$W') order by step_id,attempt;"
```

## 8) L11 Idempotent Replay + Drift Conflict (S02)

Same payload => same `WID`:

```bash
W1=$(curl -sS -X POST "$BASE/api/run" -H 'content-type: application/json' -d "$B" | jq -r .workflowID)
W2=$(curl -sS -X POST "$BASE/api/run" -H 'content-type: application/json' -d "$B" | jq -r .workflowID)
test "$W1" = "$W2" && echo idem-ok
sql_app "select count(*) from app.runs where workflow_id='$W1';"
```

Tuple drift => `409`:

```bash
B2=$(echo "$B" | jq '.opts.queuePartitionKey="tenant-other"')
curl -sS -o /tmp/spec11.run.409.json -w '%{http_code}\n' -X POST "$BASE/api/run" -H 'content-type: application/json' -d "$B2"
cat /tmp/spec11.run.409.json | jq .
```

## 9) L12 Fail-Closed Ingress + Zero Writes (S03)

Malformed JSON:

```bash
BR=$(scripts/db/psql-app.sh -Atc "select count(*) from app.runs")
curl -sS -o /tmp/spec11.badjson.out -w '%{http_code}\n' -X POST "$BASE/api/run" -H 'content-type: application/json' --data '{bad'
AR=$(scripts/db/psql-app.sh -Atc "select count(*) from app.runs")
echo "before=$BR after=$AR"
```

Strict schema/policy rejects:

```bash
curl -sS -o /tmp/spec11.badfield.out -w '%{http_code}\n' -X POST "$BASE/api/run" -H 'content-type: application/json' \
  -d '{"recipeRef":{"id":"compile-default","v":"v1"},"formData":{"goal":"x"},"opts":{"queuePartitionKey":"q"},"bogus":1}'
curl -sS -o /tmp/spec11.nopart.out -w '%{http_code}\n' -X POST "$BASE/api/run" -H 'content-type: application/json' \
  -d '{"recipeRef":{"id":"compile-default","v":"v1"},"formData":{"goal":"x"}}'
```

Expected: `400`, no silent fallback.

## 10) L13 HITL Canonical + Dedupe (S04,S05)

Gate discovery:

```bash
curl -sS "$BASE/api/runs/$W/gates" | tee /tmp/spec11.gates.json | jq .
G=$(jq -r '.[0].gateKey // empty' /tmp/spec11.gates.json); echo "$G"
```

Long-poll bound:

```bash
curl -sS "$BASE/api/runs/$W/gates/$G?timeoutS=3" | jq .
curl -sS -o /tmp/spec11.gate.timeout.bad.out -w '%{http_code}\n' "$BASE/api/runs/$W/gates/$G?timeoutS=99"
```

Reply (`origin` required):

```bash
curl -sS -X POST "$BASE/api/runs/$W/gates/$G/reply" -H 'content-type: application/json' \
  -d '{"payload":{"choice":"yes"},"dedupeKey":"qa-hitl-1","origin":"manual"}' | jq .
curl -sS -X POST "$BASE/api/runs/$W/gates/$G/reply" -H 'content-type: application/json' \
  -d '{"payload":{"choice":"yes"},"dedupeKey":"qa-hitl-1","origin":"manual"}' | jq .
curl -sS -o /tmp/spec11.hitl.409.out -w '%{http_code}\n' -X POST "$BASE/api/runs/$W/gates/$G/reply" -H 'content-type: application/json' \
  -d '{"payload":{"choice":"no"},"dedupeKey":"qa-hitl-1","origin":"manual"}'
```

Missing origin => `400`:

```bash
curl -sS -o /tmp/spec11.reply.origin.miss.out -w '%{http_code}\n' -X POST "$BASE/api/runs/$W/gates/$G/reply" -H 'content-type: application/json' \
  -d '{"payload":{"choice":"yes"},"dedupeKey":"no-origin"}'
```

Ledger proof:

```bash
sql_app "select workflow_id,gate_key,topic,dedupe_key,origin,payload_hash from app.human_interactions where workflow_id='$W' order by created_at desc limit 20;"
sql_app "select count(*) from (select workflow_id,gate_key,topic,dedupe_key,count(*) c from app.human_interactions group by 1,2,3,4 having count(*)>1)x;"
```

## 11) L14 HITL Inbox + External Event (S04,S06)

Inbox UX:

- Open `/?board=hitl-inbox`.
- Click `Open Gate`.
- Known drift `T4`: URL carries `gate=...` but run board may not focus gate automatically; manually select gate.

External ingress:

```bash
TOPIC="human:$G"
curl -sS -X POST "$BASE/api/events/hitl" -H 'content-type: application/json' \
  -d "{\"workflowId\":\"$W\",\"gateKey\":\"$G\",\"topic\":\"$TOPIC\",\"payload\":{\"choice\":\"yes\"},\"dedupeKey\":\"evt-$W-1\",\"origin\":\"webhook-ci\"}" | jq .
curl -sS -o /tmp/spec11.evt.topic.mismatch.out -w '%{http_code}\n' -X POST "$BASE/api/events/hitl" -H 'content-type: application/json' \
  -d "{\"workflowId\":\"$W\",\"gateKey\":\"$G\",\"topic\":\"human:wrong\",\"payload\":{\"choice\":\"yes\"},\"dedupeKey\":\"evt-bad\",\"origin\":\"manual\"}"
```

Expected: valid event accepted, topic mismatch `409`.

## 12) L15 Ops Console + SQL Audit (S07)

Board walkthrough:

- Open `/?board=ops`.
- Select workflow.
- Try `Cancel`, `Resume`, `Fork`.
- Known drifts `T7-T9`: legality preview/reset/aging metrics incomplete. Validate by API+SQL.

Exact-six API:

```bash
curl -sS "$BASE/api/ops/wf?limit=20" | jq '.[0]'
curl -sS "$BASE/api/ops/wf/$W" | jq .
curl -sS "$BASE/api/ops/wf/$W/steps" | jq .
curl -sS -X POST "$BASE/api/ops/wf/$W/cancel" -H 'content-type: application/json' -d '{"actor":"ops","reason":"drill"}' | jq .
curl -sS -X POST "$BASE/api/ops/wf/$W/resume" -H 'content-type: application/json' -d '{"actor":"ops","reason":"resume"}' | jq .
MAXSTEP=$(curl -sS "$BASE/api/ops/wf/$W/steps" | jq '[.[].functionId]|max')
curl -sS -X POST "$BASE/api/ops/wf/$W/fork" -H 'content-type: application/json' -d "{\"stepN\":$MAXSTEP,\"actor\":\"ops\",\"reason\":\"fork\"}" | jq .
```

Queue depth + OPS artifacts:

```bash
curl -sS "$BASE/api/ops/queue-depth?limit=20" | jq .
sql_sys "select queue_name,status,workflow_count,oldest_created_at,newest_created_at from app.v_ops_queue_depth order by queue_name,status;"
sql_app "select run_id,step_id,inline->>'op' op,inline->>'actor' actor,inline->>'reason' reason from app.artifacts where step_id='OPS' order by created_at desc limit 20;"
```

## 13) L16 Proof/Repro Workflow (S08)

Board walkthrough:

- Open Run board for `W`.
- Click `Proof` tab (manual click; deep-link may drift).
- Inspect `Repro` + `Triage` subviews.

Hard rule: treat proof UI as convenience; trust API+SQL.

Proof/repro APIs:

```bash
curl -sS "$BASE/api/runs/$W/proofs" | jq .
curl -sS "$BASE/api/runs/$W/repro" | jq .
pnpm exec tsx scripts/repro-pack.ts --run "$W" --out ".tmp/repro.$W.json"
jq '{meta:.meta,run:.run.workflow_id,dbosStatus:(.dbos.parentStatuses|length),dbosEvents:(.dbos.parentEvents|length)}' ".tmp/repro.$W.json"
```

Triage order (never reorder):

```bash
curl -sf "$BASE/healthz" | jq .
curl -sS "$BASE/api/runs/$W" | jq .
sql_app "select id,workflow_id,status,last_step,retry_count,next_action,error from app.runs where workflow_id='$W';"
sql_app "select step_id,attempt,phase from app.run_steps where run_id=(select id from app.runs where workflow_id='$W') order by step_id,attempt;"
sql_sys "select workflow_uuid,status,queue_name,application_version from dbos.workflow_status where workflow_uuid='$W';"
```

## 14) L17 Throughput + Budget + k6 (S10,S11)

Board walkthrough:

- Open `/?board=throughput`.
- Review fairness/priority/budgets/templates/k6 cards.
- Known drifts `T17-T20,T38`: provenance/coverage incomplete; verify by tests and SQL.

Backend proof pack:

```bash
pnpm exec vitest run test/integration/queue-partition-fairness.test.ts test/integration/queue-rate-limit.test.ts test/integration/spec10-priority-latency.test.ts test/integration/spec10-dedupe-collapse.test.ts test/integration/spec10-budget-ingress.test.ts test/integration/spec10-budget-runtime.test.ts --config vitest.config.ts
pnpm exec vitest run test/integration/sbx-template-rotation.test.ts test/integration/sbx-template-perf.test.ts --config vitest.config.ts
```

Budget negative probes:

```bash
curl -sS -o /tmp/spec11.budget.schema400.json -w '%{http_code}\n' -X POST "$BASE/api/run" -H 'content-type: application/json' \
  -d "{\"recipeRef\":{\"id\":\"$RID\",\"v\":\"$RV\"},\"formData\":{\"goal\":\"budget-schema\",\"tenant\":\"acme\"},\"opts\":{\"queuePartitionKey\":\"tenant-acme\",\"budget\":{\"maxFanout\":0,\"maxSBXMinutes\":1,\"maxArtifactsMB\":1,\"maxRetriesPerStep\":0,\"maxWallClockMS\":1}}}"
curl -sS -o /tmp/spec11.budget.policy400.json -w '%{http_code}\n' -X POST "$BASE/api/run" -H 'content-type: application/json' \
  -d "{\"recipeRef\":{\"id\":\"$RID\",\"v\":\"$RV\"},\"formData\":{\"goal\":\"budget-policy\",\"tenant\":\"acme\"},\"opts\":{\"queuePartitionKey\":\"tenant-acme\",\"workload\":{\"concurrency\":1,\"steps\":3,\"sandboxMinutes\":1},\"budget\":{\"maxFanout\":1,\"maxSBXMinutes\":5,\"maxArtifactsMB\":5,\"maxRetriesPerStep\":0,\"maxWallClockMS\":30000}}}"
sql_app "select run_id,step_id,payload from app.artifacts where step_id='BUDGET' order by created_at desc limit 20;"
```

k6 sequential only:

```bash
mise run perf:k6:smoke
mise run perf:k6:ramp
ls -lh .tmp/k6
```

## 15) L18 Recipe Registry + Patch Review (S12,S13)

Recipe APIs (truth path):

```bash
curl -sS "$BASE/api/recipes" | jq '.[0]'
curl -sS "$BASE/api/recipes/$RID/versions" | jq '.[0]'
curl -sS -X POST "$BASE/api/recipes/export" -H 'content-type: application/json' -d "{\"id\":\"$RID\"}" | jq .
```

Board note:

- `/?board=recipe` exists.
- Known drift `T21`: import/export controls + start path are partial; use API for non-demo work.

Patch review:

```bash
curl -sS "$BASE/api/runs/$W/steps/ApplyPatchST/patches" | jq .
sql_app "select run_id,step_id,patch_index,preimage_hash,postimage_hash,diff_hash,applied_at,rolled_back_at from app.patch_history order by created_at desc limit 20;"
```

Known drift `T22,T23`: UI omits some guard semantics; SQL is oracle.

## 16) L19 Split Durability + Crash Floor (S09)

```bash
pnpm exec vitest run test/e2e/api-shim.test.ts --config vitest.config.ts
mise run -f wf:crashdemo
```

If local teardown hangs: cancel active workflows before DBOS shutdown (CY9 learning).

## 17) L20 Signoff Board (S15; binary rule)

Board walkthrough:

- Open `/?board=signoff`.
- Confirm `GO|NO_GO` verdict, PF strip, mandatory tiles, rollback triggers.

Current truthful verdict: `NO_GO` until closure blockers resolved (`T40`).

API + unit proof:

```bash
curl -sS "$BASE/api/ops/signoff" | jq .
pnpm exec vitest run test/unit/spec11-signoff-model.test.ts --config vitest.config.ts
pnpm exec vitest run test/unit/signoff-client.test.ts --config vitest.config.ts
```

Freshness/matrix/provenance debts remain (`T28,T32,T33,T35`).

## 18) L21 Live Integrations + Live E2E (bounded claim only)

Strict smoke:

```bash
OC_STRICT_MODE=1 OC_MODE=live mise run oc:live:smoke
OC_STRICT_MODE=1 SBX_MODE=live SBX_PROVIDER=e2b mise run sbx:live:smoke
```

Alt provider gate:

```bash
OC_STRICT_MODE=1 SBX_MODE=live SBX_PROVIDER=microsandbox SBX_ALT_PROVIDER_ENABLED=true mise run sbx:live:smoke
```

Live full lane:

```bash
OC_STRICT_MODE=1 OC_MODE=live SBX_MODE=live SBX_PROVIDER=e2b mise run full
```

Interpretation: proves strict path viability, not blanket production readiness.

## 19) L22 Scenario Matrix (S00..S15 coverage checklist)

- `S00`: bootstrap + posture (`quick/check/full`, claim scope visibility).
- `S01`: canonical `/api/run` + persisted hash/ref fields.
- `S02`: identical replay same WID; drift tuple => `409`.
- `S03`: malformed/schema/policy => `400` + zero writes.
- `S04`: gate list/get/reply canonical path with `origin`.
- `S05`: dedupe idem vs drift `409`; timeout/escalation behavior.
- `S06`: `/api/events/hitl` topic/gate/state enforcement.
- `S07`: ops exact-six + actor/reason + OPS artifact append-only.
- `S08`: repro pack export + fixed triage order.
- `S09`: split topology parity + restart durability.
- `S10`: fairness/rate/priority/dedupe proofs with SQL corroboration.
- `S11`: budget ingress/runtime guards + `BUDGET` artifact.
- `S12`: recipe lifecycle/import/export + pinned ref behavior.
- `S13`: reversible patch tuple + rollback chronology.
- `S14`: live smoke strictness (bounded claim).
- `S15`: signoff binary verdict; missing evidence/freshness => fail closed.

Matrix truth note: `GP81` scenario e2e file is missing (`T32`), so do not claim “coverage complete” yet.

## 20) L30 Binary Release Gate (non-negotiable)

```bash
mise run quick
mise run check
mise run full
mise tasks deps check
mise run -f wf:crashdemo
mise run policy
```

Verdict law:

- Any red => `NO_GO`.
- Any mandatory tile without evidence refs => `NO_GO` (false-green trigger).
- GO requires same-tree freshness + proofs + inactive rollback triggers.

## 21) Daily Loop (muscle memory, no fraud)

```bash
# 1) boot split
PORT=3001 ADMIN_PORT=3002 DBOS__APPVERSION="$APPV" OC_MODE=replay SBX_MODE=mock WORKFLOW_RUNTIME_MODE=api-shim mise run start:worker &
PORT=3001 ADMIN_PORT=3003 DBOS__APPVERSION="$APPV" OC_MODE=replay SBX_MODE=mock WORKFLOW_RUNTIME_MODE=api-shim mise run start:api-shim &
sleep 2

# 2) start canonical run
curl -sS -X POST "$BASE/api/run" -H 'content-type: application/json' -d "$B" | tee /tmp/spec11.loop.run.json
W=$(jq -r .workflowID /tmp/spec11.loop.run.json)

# 3) resolve gate if present
G=$(wait_gate "$W" || true)
[ -n "$G" ] && curl -sS -X POST "$BASE/api/runs/$W/gates/$G/reply" -H 'content-type: application/json' -d '{"payload":{"choice":"yes"},"dedupeKey":"loop-yes-1","origin":"manual"}' | jq .

# 4) prove and archive
pnpm exec tsx scripts/repro-pack.ts --run "$W" --out ".tmp/repro.$W.json"
mkdir -p .tmp/spec11-tutorial
cp -f /tmp/spec11.* .tmp/spec11-tutorial/ 2>/dev/null || true
cp -f .tmp/repro.* .tmp/spec11-tutorial/ 2>/dev/null || true
```

No screenshots-as-proof. Keep SQL/API artifacts.
