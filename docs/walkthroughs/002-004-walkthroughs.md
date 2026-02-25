# Walkthrough: Deterministic App Operations (Specs 02-04)

Expert-grade SSOT for operating the shipped implementation. Fail-closed law strictly enforced.

## 0. Foundational Posture
- **Identity**: `intentHash=sha256(canon(intent))`. Drift => `409 Conflict`.
- **Topology**: Split worker + api-shim. `DBOS__APPVERSION` must match exactly.
- **Queue**: Parent intentQ only. Fanout sbxQ only. Partition key mandatory.
- **Oracle**: SQL truth > API > UI > Logs (last resort).

## 1. Environment & Preflight
Set strict posture. Disable legacy routes. Enable partition enforcement.

```bash
# Sourcing live config
source .env 2>/dev/null || echo "WARN: .env missing"

export BASE=http://127.0.0.1:3001
export APPV=spec12-live-v1
export WORKFLOW_RUNTIME_MODE=api-shim
export DBOS__APPVERSION=$APPV
export OC_MODE=live
export SBX_MODE=live
export SBX_PROVIDER=e2b
export OC_STRICT_MODE=1
export SBX_QUEUE_PARTITION=true
export ENABLE_LEGACY_RUN_ROUTES=false
export CLAIM_SCOPE=live-smoke

# Dependencies & Build
MISE_TASK_OUTPUT=prefix mise install
mise run db:up
mise run db:sys:reset && mise run db:reset && mise run db:migrate
pnpm exec tsx scripts/seed-recipes-v1.ts
mise run build
```

## 2. Boot Service Mesh
Three-terminal setup for split-topology execution.

```bash
# TERM-A: OpenCode Daemon
OC_MODE=live OC_SERVER_PORT=4096 mise run -f oc:daemon:up

# TERM-B: Workflow Worker (Execution Engine)
PORT=3001 ADMIN_PORT=3002 mise run start:worker

# TERM-C: API Shim (Ingress/Read Only)
PORT=3001 ADMIN_PORT=3003 mise run start:api-shim
```

**Liveness Check:**
```bash
curl -sf $BASE/healthz | jq .
curl -sf $BASE/api/ops/queue-depth?limit=5 | jq .
```

## 3. End-User (EU) Value Path
Execute goal-oriented workloads via canonical API.

### 3.1 Start Run (Idempotent)
Prepare payload from active recipe.
```bash
# Seed metadata (pick a stable recipe whose intent template actually uses formData.goal)
R=$(scripts/db/psql-app.sh -Atc "select rv.id||'@'||rv.v from app.recipe_versions rv where rv.status='stable' and coalesce(rv.json->'intentTmpl'->>'goal','') like '%{{formData.goal}}%' order by rv.created_at desc limit 1")
test -n "$R" || { echo 'No formData-aware stable recipe found. Run pnpm exec tsx scripts/seed-recipes-v1.ts'; exit 1; }
RID=${R%@*}; RV=${R#*@}

# Construct canonical body
B=$(jq -nc --arg id "$RID" --arg v "$RV" '{recipeRef:{id:$id,v:$v},formData:{goal:"extract risk factors",tenant:"acme"},opts:{lane:"interactive",queuePartitionKey:"tenant-acme"}}')

# Trigger
W=$(curl -sS -X POST $BASE/api/run -H 'content-type: application/json' -d "$B" | jq -r .workflowID)
echo "WorkflowID: $W"
```

### 3.2 Poll & Interact
Monitor terminal status or HITL gates.
```bash
# Header Polling
curl -sS $BASE/api/runs/$W | jq '{workflowID,status,lastStep,nextAction}'

# Interaction (if WAITING_INPUT)
G=$(curl -sS $BASE/api/runs/$W/gates | jq -r '.[0].gateKey')
curl -sS -X POST $BASE/api/runs/$W/gates/$G/reply \
  -H 'content-type: application/json' \
  -d '{"payload":{"choice":"yes","rationale":"approve"},"dedupeKey":"eu-1","origin":"manual"}'
```

### 3.3 Value Readout
Extract artifacts and proof.
```bash
# Proof aggregate
curl -sS $BASE/api/runs/$W/proofs | jq .

# Repro pack (SSOT evidence)
curl -sS $BASE/api/runs/$W/repro | jq .
```

## 4. QA: Deterministic Proofs
Verify fail-closed properties and zero-write guarantees.

### 4.1 Idempotence & Drift
```bash
# Duplicate start => Success (same WID)
W1=$(curl -sS -X POST $BASE/api/run -H 'content-type: application/json' -d "$B" | jq -r .workflowID)
test "$W" = "$W1" && echo "Idempotent OK"

# Identity Drift => 409 (partition key is identity-bound)
B_DRIFT=$(echo "$B" | jq '.opts.queuePartitionKey="tenant-other"')
curl -i -X POST $BASE/api/run -H 'content-type: application/json' -d "$B_DRIFT" # Expect 409
```

### 4.2 Strict Input Validation
```bash
# Malformed JSON => 400
curl -i -X POST $BASE/api/run -H 'content-type: application/json' --data '{"bad":}'

# Policy Violation (Budget) => 400
B_HUGE=$(echo "$B" | jq '.opts.workload={"concurrency":999,"steps":1,"sandboxMinutes":1}')
curl -i -X POST $BASE/api/run -H 'content-type: application/json' -d "$B_HUGE" # Expect 400
```

## 5. FDE: Operator Command & Control
Live manual for incident recovery and audit.

### 5.1 Ops Six Mutations
Guarded state transitions with mandatory audit log.
```bash
# Read current state first (required for legal transitions)
S=$(curl -sS $BASE/api/ops/wf/$W | jq -r '.status')
echo "status=$S"

if [ "$S" = "ENQUEUED" ] || [ "$S" = "PENDING" ]; then
  curl -X POST $BASE/api/ops/wf/$W/cancel -d '{"actor":"fde","reason":"debug"}'
fi

if [ "$S" = "CANCELLED" ] || [ "$S" = "ENQUEUED" ]; then
  curl -X POST $BASE/api/ops/wf/$W/resume -d '{"actor":"fde","reason":"fixed deps"}'
fi

if [ "$S" = "ERROR" ] || [ "$S" = "MAX_RECOVERY_ATTEMPTS_EXCEEDED" ]; then
  curl -X POST $BASE/api/ops/wf/$W/fork -d '{"stepN":1,"actor":"fde","reason":"retry alternate path"}'
fi
```

### 5.2 Reversibility & Audit
Verify patch history before terminal projection.
```bash
# Patch snapshot
curl -sS $BASE/api/runs/$W/steps/ApplyPatchST/patches | jq .

# Audit SQL
scripts/db/psql-app.sh -c "select run_id,step_id,inline->>'actor' fde from app.artifacts where step_id='OPS'"
```

## 6. Expert Scenarios

### 6.1 Patch Rejection & Rollback
Verify system reverts state on failed `ApplyPatchST`.
```bash
# 1. Start run that will trigger ApplyPatchST
# 2. Kill worker mid-apply or inject FS error
# 3. Verify SQL state
scripts/db/psql-app.sh -c "select target_path,preimage_hash,postimage_hash,rolled_back_at from app.patch_history where run_id='$W'"
# 4. Resume via Ops
curl -X POST $BASE/api/ops/wf/$W/resume -d '{"actor":"fde","reason":"FS fixed"}'
```

### 6.2 Recipe Lifecycle Promotion
Moving from `draft` to `stable` requires proof.
```bash
# List versions
curl -sS $BASE/api/recipes/$RID/versions | jq '.[] | {v,status,created_at}'

# Lawful promotion path only (service-enforced candidate->stable gate)
# Example: re-run seed promotion script (uses src/db/recipeRepo.ts setCandidate+promoteStable with coverage checks)
pnpm exec tsx scripts/seed-recipes-v1.ts

# Anti-pattern (forbidden): do NOT mutate app.recipes.active_v directly via SQL; it bypasses eval+fixture gate.
```

### 6.3 HITL Escalation Management
Identify stale gates and resolve via operator topic.
```bash
# Inbox Query
curl -sS "$BASE/api/hitl/inbox?limit=10" | jq '.[] | {workflowID,gateKey,topic}'

# Force Resolve via Sys Topic
curl -X POST $BASE/api/runs/$W/gates/$G/reply \
  -H 'content-type: application/json' \
  -d '{"payload":{"decision":"escalate"},"dedupeKey":"sys-esc-1","origin":"system"}'
```

## 7. Signoff & Triage
Binary verdict for release and fault mapping.

### 7.1 Release Truth
```bash
curl -sS $BASE/api/ops/signoff | jq -e '.verdict == "GO"'
```

### 7.2 Fault Map (FDE Quick-Ref)
- **Queued Forever**: Check `DBOS__APPVERSION` drift between shim and worker.
- **409 Conflict**: Intent identity collision. Inspect response `drift` array.
- **410 Gone**: Legacy routes disabled. Transition caller to `/api/run`.
- **400 queue_policy_violation**: Budget breach (concurrency/minutes). Adjust `opts.workload`.
- **Duplicate Receipts**: Fatal S0 regression. Halt release.

## 8. Emergency Procedures

### 8.1 Drain & Stop
Safe shutdown protocol for live workers.
```bash
# 1. Cancel all PENDING/ENQUEUED
scripts/db/psql-sys.sh -c "update dbos.workflow_status set status='CANCELLED' where status='ENQUEUED'"
# 2. Signal stop
mise run stop
```

### 8.2 Evidence Archival
Never claim success from memory. Export proof.
```bash
pnpm exec tsx scripts/repro-pack.ts --run $W --out .tmp/evidence.$W.json
```
