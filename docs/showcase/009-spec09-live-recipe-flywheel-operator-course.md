# 009 Spec-09 Live Recipe Runner + HITL/Ops/Repro Field Course (As-Built 2026-02-22)

## 0) Hard Stance

- Goal: extract production value fast; architecture lore is out-of-scope.
- Truth oracle order: `app.*` SQL -> `dbos.workflow_status/events` -> API JSON.
- Priority: contract > deterministic fail-closed > SQL x-once > ergonomics.
- Canonical product ingress: `POST /api/run`.
- Legacy ingress (`/api/runs`, `/intents/:id/run`, `/runs/:id/approve-plan`) is compat-only.
- Run identity law: `workflowID=intentId=ih_<sha256(canon(intent))>`.
- Stable workflow step set: `CompileST|ApplyPatchST|DecideST|ExecuteST`.
- Queue law: parent `intentQ`; child fanout `sbxQ`.
- Partition law: with `SBX_QUEUE_PARTITION=true` (default), parent starts require nonblank `queuePartitionKey`.
- Error lattice only: `400|404|409|500`.
- Release law: any red in `quick|check|full` => `NO_GO`.

## 1) What You Get Now (Real)

- Strict recipe contracts/import/export (`/api/recipes/import|export`) with canonical JSON egress.
- Hash-idempotent `/api/run` with persisted `intentHash|recipeRef|recipeHash`.
- Strong HITL gate APIs (`/api/runs/:wid/gates*`, `/api/events/hitl`) with x-once ledger and dedupe-drift `409`.
- Ops exact-six (`/api/ops/wf` list/get/steps/cancel/resume/fork) + durable op artifacts (`actor`,`reason`).
- Repro snapshot exporter (`scripts/repro-pack.ts`) including DBOS status/events parent+child scope.
- Crash/chaos/e2e proof lanes via `mise`.

## 2) Current Reality (Do Not Mis-Sell)

- `/api/run` works only when recipe exists in both `app.recipe_versions(id,v,...)` and `app.recipes(id,name=recipe-id,active_v=v,...)` (queue-policy lookup).
- No public HTTP promote endpoint yet; promotion is repo-function path.
- `ApplyPatchST` reversible apply/rollback is wired and proven.
- Full autonomous postmortem->patchgen->version-bump->publish loop is not exposed as a complete operator API flow.

## 3) Track Router

- PO demo (12m): `L00 -> L10 -> L11 -> L12 -> L20 -> L30`.
- QA contract/determinism (30m): `L00 -> L10..L18 -> L21 -> L24 -> L25`.
- FDE incident/repro (45m): `L00 -> L11 -> L12 -> L15 -> L16 -> L17 -> L24`.

## 4) L00 Bootstrap

```bash
MISE_TASK_OUTPUT=prefix mise install
mise run db:up
mise run db:sys:reset
mise run db:reset
mise run build
```

Pass: all green.

## 5) L01 Runtime Lanes

- Monolith (fastest):

```bash
OC_MODE=replay SBX_MODE=mock PORT=3001 ADMIN_PORT=3002 mise run start
```

- Split topology (parity):

```bash
# terminal A
OC_MODE=replay SBX_MODE=mock DBOS__APPVERSION=v1 PORT=3011 ADMIN_PORT=3012 mise run start:worker
# terminal B
OC_MODE=replay SBX_MODE=mock DBOS__APPVERSION=v1 PORT=3011 ADMIN_PORT=3013 mise run start:api-shim
```

- Live integrations (later labs): `OC_MODE=live`, `SBX_MODE=live`.

## 6) L02 Shell Kit (Copy Once)

```bash
BASE=http://127.0.0.1:3001
term='SUCCESS|ERROR|CANCELLED'

wait_term(){ wid="$1"; for i in $(seq 1 180); do s=$(curl -sS "$BASE/api/runs/$wid" | jq -r '.status // empty'); echo "$s" | grep -Eq "$term" && return 0; sleep 0.5; done; return 1; }
wait_next(){ wid="$1"; want="$2"; for i in $(seq 1 180); do n=$(curl -sS "$BASE/api/runs/$wid" | jq -r '.nextAction // empty'); [ "$n" = "$want" ] && return 0; sleep 0.5; done; return 1; }
wait_gate(){ wid="$1"; for i in $(seq 1 180); do g=$(curl -sS "$BASE/api/runs/$wid/gates" | jq -r '.[0].gateKey // empty'); [ -n "$g" ] && { echo "$g"; return 0; }; sleep 0.5; done; return 1; }
sql_app(){ scripts/db/psql-app.sh -c "$1"; }
sql_sys(){ scripts/db/psql-sys.sh -c "$1"; }
```

## 7) L10 Recipe Bootstrap For `/api/run` (Strict, Repeatable)

1. Create minimal recipe bundle:

```bash
cat > /tmp/spec09.recipe.bundle.json <<'JSON'
{
  "id": "spec09.demo",
  "versions": [
    {
      "id": "spec09.demo",
      "v": "1.0.0",
      "name": "spec09 demo",
      "tags": ["showcase"],
      "formSchema": {
        "type": "object",
        "properties": {
          "goal": {"type": "string", "default": "spec09 goal"},
          "accountId": {"type": "string", "default": "acct-009"}
        },
        "required": []
      },
      "intentTmpl": {
        "goal": "{{formData.goal}}",
        "inputs": {"accountId": "{{formData.accountId}}"},
        "constraints": {}
      },
      "wfEntry": "Runner.runIntent",
      "queue": "intentQ",
      "limits": {"maxSteps": 10, "maxFanout": 1, "maxSbxMin": 5, "maxTokens": 1024},
      "eval": [
        {"id": "ev1", "kind": "file_exists", "glob": "**/*"}
      ],
      "fixtures": [
        {"id": "fx1", "formData": {"goal": "fixture-goal", "accountId": "acct-fx1"}}
      ],
      "prompts": {"compile": "compile", "postmortem": "postmortem"}
    }
  ]
}
JSON
```

2. Import bundle (strict contract ingress):

```bash
curl -sS -X POST "$BASE/api/recipes/import" -H 'content-type: application/json' \
  --data-binary @/tmp/spec09.recipe.bundle.json | jq
```

3. Promote via repo functions (no HTTP promote API yet):

```bash
pnpm exec tsx -e "import {createPool,closePool} from './src/db/pool'; import {setCandidate,promoteStable} from './src/db/recipeRepo'; const p=createPool(); const a=await setCandidate(p,'spec09.demo','1.0.0'); const b=await promoteStable(p,'spec09.demo','1.0.0'); console.log(JSON.stringify({candidate:a,stable:b})); await p.end(); await closePool();"
```

4. SQL verify promotion pointer:

```bash
sql_app "select rv.id,rv.v,rv.status,r.active_v from app.recipe_versions rv join app.recipes r on r.id=rv.id where rv.id='spec09.demo' and rv.v='1.0.0';"
```

## 8) L11 `/api/run` Canonical Product Flow

1. Start run:

```bash
curl -sS -X POST "$BASE/api/run" -H 'content-type: application/json' \
  -d '{"recipeRef":{"id":"spec09.demo","v":"1.0.0"},"formData":{"goal":"alpha","accountId":"acct-1"},"opts":{"queuePartitionKey":"tenant-009"}}' \
  | tee /tmp/spec09.run.a.json | jq '{workflowID,status,recipeRef,recipeHash,intentHash}'
```

2. Replay exact same request (must converge to same handle):

```bash
curl -sS -X POST "$BASE/api/run" -H 'content-type: application/json' \
  -d '{"recipeRef":{"id":"spec09.demo","v":"1.0.0"},"formData":{"goal":"alpha","accountId":"acct-1"},"opts":{"queuePartitionKey":"tenant-009"}}' \
  | tee /tmp/spec09.run.b.json | jq '{workflowID,recipeHash,intentHash}'
diff -u <(jq -S '{workflowID,recipeHash,intentHash}' /tmp/spec09.run.a.json) <(jq -S '{workflowID,recipeHash,intentHash}' /tmp/spec09.run.b.json)
```

3. SQL proof (`count=1`, persisted hash/ref fields):

```bash
WID=$(jq -r .workflowID /tmp/spec09.run.a.json)
sql_app "select count(*) as n from app.runs where workflow_id='${WID}';"
sql_app "select id,intent_hash,recipe_id,recipe_v,recipe_hash from app.intents where id='${WID}';"
sql_app "select workflow_id,intent_hash,recipe_id,recipe_v,recipe_hash,queue_partition_key from app.runs where workflow_id='${WID}';"
```

4. Read projections:

```bash
curl -sS "$BASE/api/runs/$WID" | jq '{workflowID,status,nextAction,lastStep,intentHash,recipeRef,recipeHash}'
curl -sS "$BASE/api/runs/$WID/steps" | jq 'map({stepID,attempt,startedAt})'
```

## 9) L12 HITL Primary Path (Canonical)

1. Discover gate:

```bash
WID=$(jq -r .workflowID /tmp/spec09.run.a.json)
wait_next "$WID" APPROVE_PLAN
GATE=$(wait_gate "$WID")
echo "$GATE"
curl -sS "$BASE/api/runs/$WID/gates/$GATE?timeoutS=1" | jq '{workflowID,gateKey,state,deadlineAt,prompt:(.prompt|{ttlS,createdAt,deadlineAt})}'
```

2. Approve via gate reply:

```bash
DK="spec09-${WID}-yes-1"
curl -sS -X POST "$BASE/api/runs/$WID/gates/$GATE/reply" -H 'content-type: application/json' \
  -d "{\"payload\":{\"choice\":\"yes\",\"rationale\":\"approve\"},\"dedupeKey\":\"$DK\",\"origin\":\"manual\"}" | jq
wait_term "$WID"
curl -sS "$BASE/api/runs/$WID" | jq '{workflowID,status,lastStep,nextAction,error}'
```

3. SQL ledger proof (`origin` + x-once tuple):

```bash
sql_app "select workflow_id,gate_key,topic,dedupe_key,origin,count(*) over (partition by workflow_id,gate_key,topic,dedupe_key) as n from app.human_interactions where workflow_id='${WID}' order by created_at desc limit 5;"
```

## 10) L13 HITL Idempotence + Drift Matrix

- Same dedupe + same payload (idempotent success):

```bash
curl -sS -X POST "$BASE/api/runs/$WID/gates/$GATE/reply" -H 'content-type: application/json' \
  -d "{\"payload\":{\"choice\":\"yes\",\"rationale\":\"approve\"},\"dedupeKey\":\"$DK\",\"origin\":\"manual\"}" | jq
```

- Same dedupe + different payload (`409`):

```bash
curl -sS -o /tmp/spec09.hitl.409.json -w '%{http_code}\n' -X POST "$BASE/api/runs/$WID/gates/$GATE/reply" -H 'content-type: application/json' \
  -d "{\"payload\":{\"choice\":\"no\"},\"dedupeKey\":\"$DK\",\"origin\":\"manual\"}"
cat /tmp/spec09.hitl.409.json | jq .
```

- Non-waiting reply guard proof lane:

```bash
mise run test:integration:mock:file test/integration/hitl-correctness-policy.test.ts
```

## 11) L14 External HITL Event Ingress

1. Start fresh run to waiting gate:

```bash
curl -sS -X POST "$BASE/api/run" -H 'content-type: application/json' \
  -d '{"recipeRef":{"id":"spec09.demo","v":"1.0.0"},"formData":{"goal":"beta","accountId":"acct-2"},"opts":{"queuePartitionKey":"tenant-009"}}' \
  | tee /tmp/spec09.run.c.json >/dev/null
W3=$(jq -r .workflowID /tmp/spec09.run.c.json)
wait_next "$W3" APPROVE_PLAN
G3=$(wait_gate "$W3")
TOPIC="human:$G3"
```

2. Send external event:

```bash
curl -sS -X POST "$BASE/api/events/hitl" -H 'content-type: application/json' \
  -d "{\"workflowId\":\"$W3\",\"gateKey\":\"$G3\",\"topic\":\"$TOPIC\",\"payload\":{\"choice\":\"yes\",\"rationale\":\"external approve\"},\"dedupeKey\":\"evt-$W3-1\",\"origin\":\"webhook-ci\"}" | jq
wait_term "$W3"
```

3. Negative probes:

```bash
curl -sS -o /tmp/spec09.evt.badtopic.json -w '%{http_code}\n' -X POST "$BASE/api/events/hitl" -H 'content-type: application/json' \
  -d "{\"workflowId\":\"$W3\",\"gateKey\":\"$G3\",\"topic\":\"human:wrong\",\"payload\":{},\"dedupeKey\":\"evt-$W3-x\",\"origin\":\"webhook\"}"
cat /tmp/spec09.evt.badtopic.json | jq .
```

## 12) L15 Reversible Patch + Rollback Proof (In-Graph)

Use the executable chain proof (best signal):

```bash
mise run test:integration:mock:file test/integration/workflow-patch-rollback-chain.test.ts
```

What this proves now:

- `ApplyPatchST` writes patch ledger + `patch_apply` artifact.
- rejection (`choice=no`) triggers reverse-order rollback.
- filesystem preimage restored.
- publish guard stays fail-closed when eval/fixture coverage is insufficient.

## 13) L16 Ops Exact-Six Surface

1. list/get/steps:

```bash
curl -sS "$BASE/api/ops/wf?limit=10" | jq '.[0:3]'
curl -sS "$BASE/api/ops/wf/$W3" | jq
curl -sS "$BASE/api/ops/wf/$W3/steps" | jq '.[0:5]'
```

2. cancel/resume/fork (with audit fields):

```bash
curl -sS -X POST "$BASE/api/ops/wf/$W3/cancel" -H 'content-type: application/json' -d '{"actor":"ops","reason":"drill"}' | jq
curl -sS -X POST "$BASE/api/ops/wf/$W3/resume" -H 'content-type: application/json' -d '{"actor":"ops","reason":"resume drill"}' | jq
MAXSTEP=$(curl -sS "$BASE/api/ops/wf/$W3/steps" | jq '[.[].functionId]|max')
curl -sS -X POST "$BASE/api/ops/wf/$W3/fork" -H 'content-type: application/json' -d "{\"stepN\":$MAXSTEP,\"actor\":\"ops\",\"reason\":\"fork drill\"}" | jq
```

3. audit artifact proof:

```bash
sql_app "select run_id,step_id,kind,inline->>'op' op,inline->>'actor' actor,inline->>'reason' reason from app.artifacts where step_id='OPS' order by created_at desc limit 10;"
```

4. exact-six policy gate:

```bash
mise run policy:ops-surface
```

## 14) L17 Repro-Pack + SQL Triage

1. Export run snapshot:

```bash
pnpm exec tsx scripts/repro-pack.ts --run "$W3" --out "/tmp/$W3.repro.json"
jq '{meta,sections:(keys)}' "/tmp/$W3.repro.json"
```

2. Verify DBOS event/status sections exist:

```bash
jq '.dbos | {workflowScope,parentStatuses:(.parentStatuses|length),childStatuses:(.childStatuses|length),parentEvents:(.parentEvents|length),childEvents:(.childEvents|length)}' "/tmp/$W3.repro.json"
```

3. Fast SQL triage tuple:

```bash
sql_app "select id,workflow_id,status,last_step,retry_count,next_action,error from app.runs where workflow_id='${W3}';"
sql_app "select step_id,attempt,phase from app.run_steps where run_id=(select id from app.runs where workflow_id='${W3}') order by step_id,attempt;"
sql_sys "select workflow_uuid,status,queue_name,queue_partition_key from dbos.workflow_status where workflow_uuid='${W3}';"
```

## 15) L18 Fail-Closed + Zero-Write Pack

- Bad JSON `/api/run`:

```bash
B=$(scripts/db/psql-app.sh -t -A -c "select count(*) from app.runs;" | tr -d '\r' | xargs)
curl -sS -o /tmp/spec09.badrun.json -w '%{http_code}\n' -X POST "$BASE/api/run" -H 'content-type: application/json' --data '{bad'
A=$(scripts/db/psql-app.sh -t -A -c "select count(*) from app.runs;" | tr -d '\r' | xargs)
echo "before=$B after=$A"
cat /tmp/spec09.badrun.json | jq .
```

- Schema drift `/api/ops/wf`:

```bash
curl -sS -o /tmp/spec09.badops.json -w '%{http_code}\n' "$BASE/api/ops/wf?unknown=1"
cat /tmp/spec09.badops.json | jq .
```

- Gate query bound check (`timeoutS>30`):

```bash
curl -sS -o /tmp/spec09.badtimeout.json -w '%{http_code}\n' "$BASE/api/runs/$W3/gates/$G3?timeoutS=99"
cat /tmp/spec09.badtimeout.json | jq .
```

## 16) L20 Split Topology Parity Drill (Worker+Shim)

1. Start worker/shim with same `DBOS__APPVERSION` (see L01).
2. Re-run `L11` + `L12` against `BASE=http://127.0.0.1:3011`.
3. Expect identical contract behavior.
4. If appVersion mismatched, expect queue execution drift/stall (fail-closed operationally).

## 17) L21 Legacy Compat Drill (Bounded)

- Start via legacy route (if `ENABLE_LEGACY_RUN_ROUTES=true`):

```bash
INTENT=$(curl -sS -X POST "$BASE/api/intents" -H 'content-type: application/json' -d '{"goal":"legacy demo","inputs":{},"constraints":{}}' | jq -r .intentId)
curl -i -sS -X POST "$BASE/intents/$INTENT/run" -H 'content-type: application/json' -d '{"queuePartitionKey":"legacy-p1"}' | sed -n '1,20p'
```

- If compat disabled (`ENABLE_LEGACY_RUN_ROUTES=false`), expect deterministic `410`.

## 18) L22 Live Integration Drills (Real Providers)

- OC live strict:

```bash
OC_STRICT_MODE=1 OC_MODE=live mise run oc:live:smoke
```

- SBX live strict (default provider):

```bash
SBX_MODE=live SBX_PROVIDER=e2b mise run sbx:live:smoke
```

- SBX alt provider gate path:

```bash
SBX_MODE=live SBX_PROVIDER=microsandbox SBX_ALT_PROVIDER_ENABLED=true mise run sbx:live:smoke
```

Use these only with real creds/network; strict mode forbids permissive pass-through.

## 19) L23 Live E2E Lane

```bash
mise run test:e2e
```

Covers end-to-end API/shim/approval/view/ops/crashdemo surfaces on isolated test ports.

## 20) L24 Proof Floor (Mandatory Signoff)

```bash
mise run quick
mise run check
mise run full
mise run -f wf:crashdemo
mise tasks deps check
```

Any fail => `NO_GO`.

## 21) L25 Scenario Matrix (High Reuse)

- Scenario: duplicate `/api/run` submit.
- Expect: same `workflowID`; `app.runs` count stays `1`.

- Scenario: missing `queuePartitionKey` with partition on.
- Expect: `400 queue_policy_violation`.

- Scenario: gate reply replay same dedupe/payload.
- Expect: idempotent `200`, no semantic drift.

- Scenario: gate reply same dedupe, different payload/topic.
- Expect: `409`.

- Scenario: external event with topic/gate mismatch.
- Expect: `409`.

- Scenario: reply on non-waiting run.
- Expect: `409` + no extra ledger rows.

- Scenario: ops illegal transition.
- Expect: `409`.

- Scenario: malformed JSON on ingress.
- Expect: `400` + zero writes.

- Scenario: patch rejection after apply.
- Expect: rollback to preimage + `patch_history.rolled_back_at` set.

- Scenario: repro export for incident.
- Expect: deterministic JSON with `run+intent+steps+artifacts+eval+human+dbos events`.

## 22) L30 One-Screen Operator Loop

```bash
# 1) start lane
OC_MODE=replay SBX_MODE=mock PORT=3001 ADMIN_PORT=3002 mise run start
# 2) run
curl -sS -X POST http://127.0.0.1:3001/api/run -H 'content-type: application/json' -d '{"recipeRef":{"id":"spec09.demo","v":"1.0.0"},"formData":{"goal":"loop","accountId":"acct-loop"},"opts":{"queuePartitionKey":"tenant-loop"}}' | tee /tmp/loop.json
W=$(jq -r .workflowID /tmp/loop.json)
# 3) gate+reply
G=$(for i in $(seq 1 120); do g=$(curl -sS http://127.0.0.1:3001/api/runs/$W/gates | jq -r '.[0].gateKey // empty'); [ -n "$g" ] && { echo "$g"; break; }; sleep 0.5; done)
curl -sS -X POST http://127.0.0.1:3001/api/runs/$W/gates/$G/reply -H 'content-type: application/json' -d '{"payload":{"choice":"yes"},"dedupeKey":"loop-yes-1","origin":"manual"}'
# 4) repro pack
pnpm exec tsx scripts/repro-pack.ts --run "$W" --out "/tmp/$W.repro.json"
# 5) floor
mise run quick
```

Use this loop until muscle memory is automatic.
