# 010 Spec-10 Live Throughput Control-Plane Field Guide (As-Built 2026-02-23)

## 0) Hard Stance

- This is an operator manual, not architecture prose.
- Oracle order is fixed: `app.* SQL -> dbos.workflow_status/events -> API JSON -> logs`.
- Priority is fixed: `contract > deterministic fail-closed > SQL x-once > throughput`.
- Canonical product ingress: `POST /api/run`.
- Legacy ingress (`POST /api/runs`, `/intents/:id/run`, `/runs/:id/approve-plan`) is compat only.
- Error lattice only: `400|404|409|500`.
- Queue law: parent `intentQ`; fanout child `sbxQ`; partition key required when partition enabled (default true).
- Run identity: `workflowID=intentId=ih_<sha256(canon(intent))>`.
- Stable steps: `CompileST|ApplyPatchST|DecideST|ExecuteST`.
- Release law: any red in `quick|check|full` => `NO_GO`.

## 1) Outcome Map

- PO value: prove deterministic user-facing behavior under pressure.
- QA value: prove lattice + zero-write + x-once + drift guards.
- FDE value: prove restart durability + ops control + repro completeness.

Fast tracks:

- PO (15m): `L00 -> L10 -> L11 -> L20 -> L30`.
- QA (45m): `L00 -> L10 -> L11 -> L12 -> L13 -> L21 -> L30`.
- FDE (60m): `L00 -> L10 -> L14 -> L15 -> L16 -> L22 -> L30`.

## 2) L00 Bootstrap

```bash
MISE_TASK_OUTPUT=prefix mise install
mise run db:up
mise run db:sys:reset
mise run db:reset
mise run db:migrate
mise run build
```

Pass condition: no red.

## 3) L01 Runtime Topology (Use Split By Default)

Terminal A:

```bash
OC_MODE=replay SBX_MODE=mock WORKFLOW_RUNTIME_MODE=api-shim \
DBOS__APPVERSION=v1 PORT=3001 ADMIN_PORT=3002 mise run start:worker
```

Terminal B:

```bash
OC_MODE=replay SBX_MODE=mock WORKFLOW_RUNTIME_MODE=api-shim \
DBOS__APPVERSION=v1 PORT=3001 ADMIN_PORT=3003 mise run start:api-shim
```

Smoke:

```bash
BASE=http://127.0.0.1:3001
curl -sf "$BASE/healthz" | jq .
curl -sf "$BASE/api/ops/queue-depth?limit=5" | jq .
```

## 4) L02 Shell Kit (Copy Once)

```bash
BASE=http://127.0.0.1:3001
term='SUCCESS|ERROR|CANCELLED'
sql_app(){ scripts/db/psql-app.sh -c "$1"; }
sql_sys(){ scripts/db/psql-sys.sh -c "$1"; }

wait_term(){ wid="$1"; for i in $(seq 1 240); do s=$(curl -sS "$BASE/api/runs/$wid" | jq -r '.status // empty'); echo "$s" | grep -Eq "$term" && return 0; sleep 0.5; done; return 1; }
wait_next(){ wid="$1"; want="$2"; for i in $(seq 1 240); do n=$(curl -sS "$BASE/api/runs/$wid" | jq -r '.nextAction // empty'); [ "$n" = "$want" ] && return 0; sleep 0.5; done; return 1; }
wait_gate(){ wid="$1"; for i in $(seq 1 240); do g=$(curl -sS "$BASE/api/runs/$wid/gates" | jq -r '.[0].gateKey // empty'); [ -n "$g" ] && { echo "$g"; return 0; }; sleep 0.5; done; return 1; }
```

## 5) L10 Recipe Bootstrap For `/api/run` (Strict ABI)

1. Create bundle.

```bash
cat > /tmp/spec10.recipe.bundle.json <<'JSON'
{
  "id": "spec10.demo",
  "versions": [
    {
      "id": "spec10.demo",
      "v": "1.0.0",
      "name": "spec10 demo",
      "tags": ["showcase"],
      "formSchema": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "goal": { "type": "string", "default": "spec10 goal" },
          "tenant": { "type": "string", "default": "acme" }
        },
        "required": ["goal", "tenant"]
      },
      "intentTmpl": {
        "goal": "{{formData.goal}}",
        "inputs": { "tenant": "{{formData.tenant}}" },
        "constraints": {}
      },
      "wfEntry": "Runner.runIntent",
      "queue": "intentQ",
      "limits": { "maxSteps": 12, "maxFanout": 2, "maxSbxMin": 5, "maxTokens": 2048 },
      "eval": [{ "id": "ev1", "kind": "file_exists", "glob": "**/*" }],
      "fixtures": [{ "id": "fx1", "formData": { "goal": "fixture", "tenant": "fx" } }],
      "prompts": { "compile": "compile", "postmortem": "postmortem" }
    }
  ]
}
JSON
```

2. Import.

```bash
curl -sS -X POST "$BASE/api/recipes/import" -H 'content-type: application/json' \
  --data-binary @/tmp/spec10.recipe.bundle.json | jq .
```

3. Promote (no public HTTP promote endpoint yet).

```bash
pnpm exec tsx -e "import {createPool,closePool} from './src/db/pool'; import {setCandidate,promoteStable} from './src/db/recipeRepo'; const p=createPool(); console.log(await setCandidate(p,'spec10.demo','1.0.0')); console.log(await promoteStable(p,'spec10.demo','1.0.0')); await p.end(); await closePool();"
```

4. Verify.

```bash
sql_app "select rv.id,rv.v,rv.status,r.active_v from app.recipe_versions rv join app.recipes r on r.id=rv.id where rv.id='spec10.demo' and rv.v='1.0.0';"
```

## 6) L11 Canonical `/api/run` Happy Path

1. Start run.

```bash
curl -sS -X POST "$BASE/api/run" -H 'content-type: application/json' \
  -d '{"recipeRef":{"id":"spec10.demo","v":"1.0.0"},"formData":{"goal":"alpha","tenant":"acme"},"opts":{"queuePartitionKey":"tenant-acme","lane":"interactive","tenantId":"tenant-acme"}}' \
  | tee /tmp/spec10.run.a.json | jq '{workflowID,status,recipeRef,recipeHash,intentHash}'
WID=$(jq -r .workflowID /tmp/spec10.run.a.json)
```

2. Observe projections.

```bash
curl -sS "$BASE/api/runs/$WID" | jq '{workflowID,status,nextAction,lastStep,intentHash,recipeRef,recipeHash,error}'
curl -sS "$BASE/api/runs/$WID/steps" | jq 'map({stepID,name,attempt,startedAt})'
```

3. SQL proof.

```bash
sql_app "select id,workflow_id,status,intent_hash,recipe_id,recipe_v,recipe_hash,queue_partition_key,budget from app.runs where workflow_id='${WID}';"
sql_app "select step_id,attempt,phase from app.run_steps where run_id=(select id from app.runs where workflow_id='${WID}') order by step_id,attempt;"
```

## 7) L12 Idempotency + Identity Drift

1. Replay identical payload (must be same workflow).

```bash
curl -sS -X POST "$BASE/api/run" -H 'content-type: application/json' \
  -d '{"recipeRef":{"id":"spec10.demo","v":"1.0.0"},"formData":{"goal":"alpha","tenant":"acme"},"opts":{"queuePartitionKey":"tenant-acme","lane":"interactive","tenantId":"tenant-acme"}}' \
  | tee /tmp/spec10.run.b.json | jq '{workflowID,recipeHash,intentHash}'
diff -u <(jq -S '{workflowID,recipeHash,intentHash}' /tmp/spec10.run.a.json) <(jq -S '{workflowID,recipeHash,intentHash}' /tmp/spec10.run.b.json)
sql_app "select count(*) as n from app.runs where workflow_id='${WID}';"
```

2. Drift tuple (same intent, changed partition/tenant) => `409`.

```bash
curl -sS -o /tmp/spec10.run.drift.json -w '%{http_code}\n' -X POST "$BASE/api/run" -H 'content-type: application/json' \
  -d '{"recipeRef":{"id":"spec10.demo","v":"1.0.0"},"formData":{"goal":"alpha","tenant":"acme"},"opts":{"queuePartitionKey":"tenant-other","tenantId":"tenant-other"}}'
cat /tmp/spec10.run.drift.json | jq .
```

## 8) L13 Legacy Proof Floor Path

```bash
I=$(curl -sS -X POST "$BASE/api/intents" -H 'content-type: application/json' \
  -d '{"goal":"legacy","inputs":{},"constraints":{}}' | jq -r .intentId)
curl -sS -X POST "$BASE/api/runs" -H 'content-type: application/json' \
  -d "{\"intentId\":\"$I\",\"queuePartitionKey\":\"tenant-legacy\"}" | jq '{workflowID,status}'
```

Expected: `POST /api/intents -> POST /api/runs -> GET /api/runs/:wid` still valid.

## 9) L14 HITL Canonical Path (`awaitHuman`)

1. Wait gate.

```bash
wait_next "$WID" APPROVE_PLAN
GATE=$(wait_gate "$WID")
curl -sS "$BASE/api/runs/$WID/gates/$GATE?timeoutS=1" | jq '{workflowID,gateKey,state,deadlineAt,prompt:(.prompt|{ttlS,createdAt,deadlineAt})}'
```

2. Reply yes.

```bash
DK="spec10-${WID}-yes-1"
curl -sS -X POST "$BASE/api/runs/$WID/gates/$GATE/reply" -H 'content-type: application/json' \
  -d "{\"payload\":{\"choice\":\"yes\",\"rationale\":\"approve\"},\"dedupeKey\":\"$DK\",\"origin\":\"manual\"}" | jq .
wait_term "$WID"
curl -sS "$BASE/api/runs/$WID" | jq '{workflowID,status,lastStep,nextAction,error}'
```

3. Ledger proof.

```bash
sql_app "select workflow_id,gate_key,topic,dedupe_key,origin,payload_hash from app.human_interactions where workflow_id='${WID}' order by created_at desc limit 5;"
```

## 10) L15 HITL Dedupe Matrix

Same dedupe + same payload => idempotent success:

```bash
curl -sS -X POST "$BASE/api/runs/$WID/gates/$GATE/reply" -H 'content-type: application/json' \
  -d "{\"payload\":{\"choice\":\"yes\",\"rationale\":\"approve\"},\"dedupeKey\":\"$DK\",\"origin\":\"manual\"}" | jq .
```

Same dedupe + different payload => `409`:

```bash
curl -sS -o /tmp/spec10.hitl.409.json -w '%{http_code}\n' -X POST "$BASE/api/runs/$WID/gates/$GATE/reply" -H 'content-type: application/json' \
  -d "{\"payload\":{\"choice\":\"no\"},\"dedupeKey\":\"$DK\",\"origin\":\"manual\"}"
cat /tmp/spec10.hitl.409.json | jq .
```

Gate long-poll bound (`timeoutS>30`) => `400`:

```bash
curl -sS -o /tmp/spec10.hitl.timeout.json -w '%{http_code}\n' "$BASE/api/runs/$WID/gates/$GATE?timeoutS=99"
cat /tmp/spec10.hitl.timeout.json | jq .
```

## 11) L16 External HITL Event Ingress

1. Start fresh waiting lane.

```bash
curl -sS -X POST "$BASE/api/run" -H 'content-type: application/json' \
  -d '{"recipeRef":{"id":"spec10.demo","v":"1.0.0"},"formData":{"goal":"beta","tenant":"acme"},"opts":{"queuePartitionKey":"tenant-acme"}}' \
  | tee /tmp/spec10.run.c.json >/dev/null
W3=$(jq -r .workflowID /tmp/spec10.run.c.json)
wait_next "$W3" APPROVE_PLAN
G3=$(wait_gate "$W3")
TOPIC="human:$G3"
```

2. Send external event.

```bash
curl -sS -X POST "$BASE/api/events/hitl" -H 'content-type: application/json' \
  -d "{\"workflowId\":\"$W3\",\"gateKey\":\"$G3\",\"topic\":\"$TOPIC\",\"payload\":{\"choice\":\"yes\",\"rationale\":\"webhook\"},\"dedupeKey\":\"evt-$W3-1\",\"origin\":\"webhook-ci\"}" | jq .
wait_term "$W3"
```

3. Topic mismatch => `409`.

```bash
curl -sS -o /tmp/spec10.evt.badtopic.json -w '%{http_code}\n' -X POST "$BASE/api/events/hitl" -H 'content-type: application/json' \
  -d "{\"workflowId\":\"$W3\",\"gateKey\":\"$G3\",\"topic\":\"human:wrong\",\"payload\":{},\"dedupeKey\":\"evt-$W3-x\",\"origin\":\"webhook\"}"
cat /tmp/spec10.evt.badtopic.json | jq .
```

## 12) L17 Ops Exact-Six + Queue-Depth

List/get/steps:

```bash
curl -sS "$BASE/api/ops/wf?limit=10" | jq '.[0:3]'
curl -sS "$BASE/api/ops/wf/$W3" | jq .
curl -sS "$BASE/api/ops/wf/$W3/steps" | jq '.[0:5]'
```

Mutations require `actor` + `reason`:

```bash
curl -sS -X POST "$BASE/api/ops/wf/$W3/cancel" -H 'content-type: application/json' -d '{"actor":"ops","reason":"drill"}' | jq .
curl -sS -X POST "$BASE/api/ops/wf/$W3/resume" -H 'content-type: application/json' -d '{"actor":"ops","reason":"resume"}' | jq .
MAXSTEP=$(curl -sS "$BASE/api/ops/wf/$W3/steps" | jq '[.[].functionId]|max')
curl -sS -X POST "$BASE/api/ops/wf/$W3/fork" -H 'content-type: application/json' -d "{\"stepN\":$MAXSTEP,\"actor\":\"ops\",\"reason\":\"fork\"}" | jq .
```

Queue depth (sys DB backed):

```bash
curl -sS "$BASE/api/ops/queue-depth?limit=20" | jq .
sql_sys "select queue_name,status,workflow_count,oldest_created_at,newest_created_at from app.v_ops_queue_depth order by queue_name,status;"
```

Audit proof:

```bash
sql_app "select run_id,step_id,inline->>'op' op,inline->>'actor' actor,inline->>'reason' reason from app.artifacts where step_id='OPS' order by created_at desc limit 10;"
```

Compat gate parity:

```bash
curl -si -X POST "$BASE/api/runs/$W3/approve-plan" -H 'content-type: application/json' -d '{"approvedBy":"qa","notes":"compat"}' | sed -n '1,25p'
```

## 13) L18 Ops CLI Batch Walkthrough

```bash
pnpm exec tsx scripts/ops/cli.ts list --status ERROR --status MAX_RECOVERY_ATTEMPTS_EXCEEDED --limit 20 --format ids
OPS_ACTOR=ops OPS_REASON="batch-cancel" scripts/ops/list_failed.sh 20 | OPS_ACTOR=ops OPS_REASON="batch-cancel" scripts/ops/cancel_batch.sh
OPS_ACTOR=ops OPS_REASON="batch-resume" scripts/ops/list_failed.sh 20 | OPS_ACTOR=ops OPS_REASON="batch-resume" scripts/ops/resume_batch.sh
OPS_ACTOR=ops OPS_REASON="retry-step1" scripts/ops/list_failed.sh 20 | OPS_ACTOR=ops OPS_REASON="retry-step1" scripts/ops/retry_from_step.sh 1
```

## 14) L19 Budget Guards (Ingress + Runtime)

Schema fail (`maxFanout` min violation) => `400`:

```bash
curl -sS -o /tmp/spec10.budget.schema400.json -w '%{http_code}\n' -X POST "$BASE/api/run" -H 'content-type: application/json' \
  -d '{"recipeRef":{"id":"spec10.demo","v":"1.0.0"},"formData":{"goal":"budget-schema","tenant":"acme"},"opts":{"queuePartitionKey":"tenant-acme","budget":{"maxFanout":0,"maxSBXMinutes":1,"maxArtifactsMB":1,"maxRetriesPerStep":0,"maxWallClockMS":1}}}'
cat /tmp/spec10.budget.schema400.json | jq .
```

Policy fail (`workload.steps > maxFanout`) => `400`:

```bash
curl -sS -o /tmp/spec10.budget.policy400.json -w '%{http_code}\n' -X POST "$BASE/api/run" -H 'content-type: application/json' \
  -d '{"recipeRef":{"id":"spec10.demo","v":"1.0.0"},"formData":{"goal":"budget-policy","tenant":"acme"},"opts":{"queuePartitionKey":"tenant-acme","workload":{"concurrency":1,"steps":3,"sandboxMinutes":1},"budget":{"maxFanout":1,"maxSBXMinutes":5,"maxArtifactsMB":5,"maxRetriesPerStep":0,"maxWallClockMS":30000}}}'
cat /tmp/spec10.budget.policy400.json | jq .
```

Runtime budget evidence lane:

```bash
pnpm exec vitest run test/integration/spec10-budget-runtime.test.ts --config vitest.config.ts
sql_app "select run_id,step_id,artifact_kind,payload from app.artifacts where step_id='BUDGET' order by created_at desc limit 5;"
```

## 15) L20 Queue Fairness / Rate / Priority Proofs

```bash
pnpm exec vitest run test/integration/queue-partition-fairness.test.ts --config vitest.config.ts
pnpm exec vitest run test/integration/queue-rate-limit.test.ts --config vitest.config.ts
pnpm exec vitest run test/integration/spec10-priority-latency.test.ts --config vitest.config.ts
pnpm exec vitest run test/integration/spec10-dedupe-collapse.test.ts --config vitest.config.ts
```

SQL oracle:

```bash
sql_sys "select workflow_uuid,queue_name,queue_partition_key,status,started_at_epoch_ms from dbos.workflow_status order by created_at desc limit 80;"
```

## 16) L21 SBX Template + Perf Evidence

```bash
mise run sbx:template:build
pnpm exec vitest run test/integration/sbx-template-rotation.test.ts --config vitest.config.ts
pnpm exec vitest run test/integration/sbx-template-perf.test.ts --config vitest.config.ts
sql_app "select recipe_id,recipe_v,deps_hash,template_key,template_id from app.sbx_templates order by created_at desc limit 20;"
```

## 17) L22 k6 Merge Gates (Sequential Only)

```bash
mise run perf:k6:smoke
mise run perf:k6:ramp
K6_BAD_FIXTURE=1 mise run perf:k6:smoke || true
ls -lh .tmp/k6
```

Expected: good lanes pass, bad fixture fails, artifacts in `.tmp/k6/*`.

## 18) L23 Malformed + Zero-Write Probes

Bad JSON `/api/run` => `400` + zero writes:

```bash
B=$(scripts/db/psql-app.sh -t -A -c "select count(*) from app.runs;" | tr -d '\r' | xargs)
curl -sS -o /tmp/spec10.badjson.json -w '%{http_code}\n' -X POST "$BASE/api/run" -H 'content-type: application/json' --data '{bad'
A=$(scripts/db/psql-app.sh -t -A -c "select count(*) from app.runs;" | tr -d '\r' | xargs)
echo "before=$B after=$A"
cat /tmp/spec10.badjson.json | jq .
```

Unknown query key `/api/ops/queue-depth` => `400`:

```bash
curl -sS -o /tmp/spec10.depth.badq.json -w '%{http_code}\n' "$BASE/api/ops/queue-depth?x=1"
cat /tmp/spec10.depth.badq.json | jq .
```

## 19) L24 X-Once SQL Audits

```bash
sql_app "select count(*) dup_run_steps from (select run_id,step_id,attempt,count(*) c from app.run_steps group by 1,2,3 having count(*)>1)x;"
sql_app "select count(*) dup_artifacts from (select run_id,step_id,idx,task_key,attempt,count(*) c from app.artifacts group by 1,2,3,4,5 having count(*)>1)x;"
sql_app "select count(*) dup_human from (select workflow_id,gate_key,topic,dedupe_key,count(*) c from app.human_interactions group by 1,2,3,4 having count(*)>1)x;"
sql_app "select count(*) dup_eval from (select run_id,check_id,count(*) c from app.eval_results group by 1,2 having count(*)>1)x;"
```

All counts must be `0`.

## 20) L25 Repro-Pack + Triage

```bash
pnpm exec tsx scripts/repro-pack.ts --run "$W3" --out ".tmp/repro.$W3.json"
jq '{meta,run,dbos:{scope:.dbos.workflowScope,parentStatuses:(.dbos.parentStatuses|length),childStatuses:(.dbos.childStatuses|length),parentEvents:(.dbos.parentEvents|length),childEvents:(.dbos.childEvents|length)}}' ".tmp/repro.$W3.json"
```

Triage order (never invert):

```bash
curl -sf "$BASE/healthz" | jq .
curl -sS "$BASE/api/runs/$W3" | jq .
sql_app "select id,workflow_id,status,last_step,retry_count,next_action,error from app.runs where workflow_id='$W3';"
sql_app "select step_id,attempt,phase from app.run_steps where run_id=(select id from app.runs where workflow_id='$W3') order by step_id,attempt;"
sql_sys "select workflow_uuid,queue_name,queue_partition_key,status from dbos.workflow_status where workflow_uuid='$W3';"
```

## 21) L26 Split-Restart Durability

```bash
pnpm exec vitest run test/e2e/api-shim.test.ts --config vitest.config.ts
mise run -f wf:crashdemo
mise run -f wf:intent:chaos
```

Expect: terminal completion + no duplicate side effects.

## 22) L27 Live Integrations + Live E2E

Strict live provider checks (fail on missing creds):

```bash
OC_STRICT_MODE=1 OC_MODE=live mise run oc:live:smoke
OC_STRICT_MODE=1 SBX_MODE=live SBX_PROVIDER=e2b mise run sbx:live:smoke
```

Alt SBX provider gate:

```bash
OC_STRICT_MODE=1 SBX_MODE=live SBX_PROVIDER=microsandbox SBX_ALT_PROVIDER_ENABLED=true mise run sbx:live:smoke
```

Live integration + e2e bundle:

```bash
OC_STRICT_MODE=1 OC_MODE=live SBX_MODE=live SBX_PROVIDER=e2b mise run full
```

If you only need e2e harness (not provider live): `mise run test:e2e`.

## 23) L30 Binary Signoff

```bash
mise run quick
mise run check
mise run full
mise tasks deps check
mise run -f wf:crashdemo
mise run policy
```

Verdict law: any red => `NO_GO`; all green in same tree => `GO`.

## 24) Scenario Matrix (Run Frequently)

- Duplicate `/api/run` same payload -> same `workflowID`; `app.runs` row count stays `1`.
- `/api/run` same intent + tuple drift (`tenantId|queuePartitionKey|budget`) -> `409`.
- Missing partition key on partitioned start -> `400 queue_policy_violation`.
- Unknown keys in strict contracts (`/api/run`, `/api/runs`, `/api/ops/*`) -> `400`.
- Malformed JSON at ingress -> `400` + zero writes.
- Missing intent/recipe -> `404`.
- HITL reply with run not `waiting_input` -> `409`.
- HITL same dedupe + same payload -> idempotent success.
- HITL same dedupe + different payload/topic -> `409`.
- HITL topic/gate mismatch on `/api/events/hitl` -> `409`.
- Gate GET `timeoutS>30` -> `400`.
- Ops cancel/resume illegal state -> `409`.
- Ops mutate without `actor|reason` -> `400`.
- Compat route gate disabled (`ENABLE_LEGACY_RUN_ROUTES=false`) -> `410`.
- Compat route enabled -> deprecation headers present.
- Budget schema invalid -> `400`.
- Budget ingress policy violation -> `400`.
- Runtime budget violation -> `BUDGET` artifact persisted before terminal projection.
- Queue fairness/rate claims -> accepted only with SQL oracle proof.
- k6 claims -> accepted only with thresholded lane + persisted `.tmp/k6/*`.
- SBX template perf claim -> accepted only with template rows + artifact evidence.
- Any quick/check/full red -> immediate `NO_GO`.

## 25) One-Screen Daily Loop

```bash
# start
OC_MODE=replay SBX_MODE=mock WORKFLOW_RUNTIME_MODE=api-shim DBOS__APPVERSION=v1 PORT=3001 ADMIN_PORT=3002 mise run start:worker &
OC_MODE=replay SBX_MODE=mock WORKFLOW_RUNTIME_MODE=api-shim DBOS__APPVERSION=v1 PORT=3001 ADMIN_PORT=3003 mise run start:api-shim &
sleep 2; BASE=http://127.0.0.1:3001

# run
curl -sS -X POST "$BASE/api/run" -H 'content-type: application/json' \
  -d '{"recipeRef":{"id":"spec10.demo","v":"1.0.0"},"formData":{"goal":"loop","tenant":"acme"},"opts":{"queuePartitionKey":"tenant-acme"}}' | tee /tmp/spec10.loop.json
W=$(jq -r .workflowID /tmp/spec10.loop.json)

# approve
G=$(for i in $(seq 1 120); do g=$(curl -sS "$BASE/api/runs/$W/gates" | jq -r '.[0].gateKey // empty'); [ -n "$g" ] && { echo "$g"; break; }; sleep 0.5; done)
curl -sS -X POST "$BASE/api/runs/$W/gates/$G/reply" -H 'content-type: application/json' \
  -d '{"payload":{"choice":"yes"},"dedupeKey":"loop-yes-1","origin":"manual"}' | jq .

# prove
pnpm exec tsx scripts/repro-pack.ts --run "$W" --out ".tmp/repro.$W.json"
mise run quick
```

Repeat until this is muscle memory.
