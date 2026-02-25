# Spec 08-11: Live Posture & Operator SSOT

Ultra-opinionated expert walkthrough for Specs 08 (HITL), 09 (SBX), 10 (Multi-tenancy), and 11 (Signoff). Focused on live environment mastery and deterministic proof.

## 0. Runtime Posture (MANDATORY)

Strict fail-closed live configuration. No silent fallbacks.

```bash
# Load live env secrets/config
source .env

# Strict posture variables
export BASE=http://127.0.0.1:3001
export APPV=spec12-03-live-v1
export WORKFLOW_RUNTIME_MODE=api-shim
export DBOS__APPVERSION=$APPV
export OC_MODE=live SBX_MODE=live SBX_PROVIDER=e2b OC_STRICT_MODE=1
export SBX_QUEUE_PARTITION=true SBX_ALT_PROVIDER_ENABLED=false
export ENABLE_LEGACY_RUN_ROUTES=false CLAIM_SCOPE=live-smoke

# Re-validate deps and migrations
mise install
mise run db:up && mise run db:migrate
mise run build
```

## 1. HITL: Human-In-The-Loop (Spec 08)

**Theory:** Every wait has a TTL. Interaction ledger enforces x-once via `(wid, gateKey, topic, dedupeKey)`.

### 1.1 Start Canonical Run
```bash
# Get active recipe
R=$(scripts/db/psql-app.sh -Atc "select rv.id||'@'||rv.v from app.recipe_versions rv join app.recipes r on r.id=rv.id and r.active_v=rv.v order by rv.created_at desc limit 1")
RID=${R%@*}; RV=${R#*@}

# Execute POST
curl -sS -X POST $BASE/api/run \
  -H 'content-type: application/json' \
  -d "{
    \"recipeRef\": {\"id\": \"$RID\", \"v\": \"$RV\"},
    \"formData\": {\"goal\": \"prod-approval\"},
    \"opts\": {\"lane\": \"interactive\", \"queuePartitionKey\": \"tenant-prod\"}
  }" | jq .
```

### 1.2 Interactive Reply (Manual Origin)
Required for 11.2 (no replies without explicit origin).
```bash
# Retrieve pending gate
W=<WID> # from previous output
G=$(curl -sS $BASE/api/runs/$W/gates | jq -r '.[0].gateKey')

# Send reply with origin and dedupe
curl -sS -X POST $BASE/api/runs/$W/gates/$G/reply \
  -H 'content-type: application/json' \
  -d "{
    \"payload\": {\"choice\": \"yes\"},
    \"dedupeKey\": \"manual-appr-$(date +%s)\",
    \"origin\": \"manual\"
  }" | jq .
```

## 2. SBX: Sandboxes & Budgets (Spec 09)

**Theory:** Immutable templates, hard resource bounds. `BUDGET` artifact terminates run if exceeded.

### 2.1 Start Run with Budgets
```bash
curl -sS -X POST $BASE/api/run \
  -H 'content-type: application/json' \
  -d "{
    \"recipeRef\": {\"id\": \"$RID\", \"v\": \"$RV\"},
    \"formData\": {\"task\": \"complex-compute\"},
    \"opts\": {
      \"budget\": {
        \"maxSBXMinutes\": 10,
        \"maxFanout\": 5,
        \"maxArtifactsMB\": 50
      },
      \"queuePartitionKey\": \"compute-01\"
    }
  }"
```

### 2.2 Template Inspection (SQL Only)
Truth order: SQL > Logs.
```bash
scripts/db/psql-app.sh -c "select * from app.sbx_templates order by created_at desc limit 5;"
```

## 3. Multi-Tenancy & Split Topology (Spec 10)

**Theory:** Worker executes, Shim enqueues. Partition Key propagates parent -> child.

### 3.1 Partitioning Smoke
Verify that `queuePartitionKey` is never blank if enabled.
```bash
# Check propagation in system DB
scripts/db/psql-sys.sh -c "select queue_name, queue_partition_key, status from dbos.workflow_status order by created_at desc limit 10;"
```

### 3.2 Queue Depth Observability
```bash
curl -sf "$BASE/api/ops/queue-depth?limit=20" | jq .
```

## 4. Evidence & Signoff (Spec 11)

**Theory:** `GO` requires `evidenceRefs`. Scenario Matrix S00-S15 must be green.

### 4.1 Execute Scenario Matrix
```bash
# Deterministic proof generation
pnpm exec vitest run test/e2e/spec11-scenario-matrix.test.ts --config vitest.config.ts
```

### 4.2 Signoff Decision Oracle
```bash
# Binary verdict UI source
curl -sS $BASE/api/ops/signoff | jq '{verdict, posture, pfTiles:(.pfTiles|length)}'
```

### 4.3 Repro Pack Export
Portable truth for triage.
```bash
pnpm exec tsx scripts/repro-pack.ts --run $W --out .tmp/repro.$W.json
```

## 5. Role Tracks & Operational Scenarios

### 5.1 FDE Track: Incident Mitigation
**Objective:** Maintain throughput while resolving drift.
- **Drift Detection**: `curl $BASE/api/ops/wf?status=ERROR`
- **Root Cause**: `curl $BASE/api/runs/$W/repro | jq .`
- **Mitigation**: `POST /api/ops/wf/$W/cancel` then `FORK` from last known good step.

### 5.2 QA Track: Regresion Zero
**Objective:** Prove x-once and schema integrity.
- **Idempotence Proof**: Submit same JSON twice -> verify `workflowID` is identical + `isReplay=true`.
- **Schema Cage**: Submit payload with unknown keys -> verify `400` + zero SQL writes.
- **Determinism Check**: `mise run policy:hitl-correctness`

### 5.3 EU Track: Value Extraction
**Use Case: Automated Audit Trail**
1. **Trigger**: Start run with `formData.audit=true`.
2. **Execute**: Run completes through sandboxed compliance steps.
3. **Value**: Fetch `GET /api/runs/$W/proofs` for a generated compliance certificate.

**Use Case: Safe Multi-region Deployment**
1. **Trigger**: Set `opts.queuePartitionKey=region-us-east-1`.
2. **Execute**: SBX executes in isolated region bucket.
3. **Value**: Regional failure is isolated; other partitions remain green.

## 6. SSOT Manual: Triage Workflow

Strict order for on-call engineers:

1. **L1 (Connectivity)**: `curl -sf $BASE/healthz`
2. **L2 (Flow)**: `GET /api/ops/queue-depth` - if depth > 0 and no progress, check worker matching `APPVERSION`.
3. **L3 (Data)**: `scripts/db/psql-app.sh -c "select status, last_step from app.runs where id='$W'"`
4. **L4 (Evidence)**: Inspect `.tmp/repro.$W.json`.
5. **L5 (Logs)**: `tail -f logs/worker.log`

## 7. Signoff Proof Floor (Binary Verdict)

Verify before any release.

- **PF Quick**: `mise run quick` (lint + component tests)
- **PF Check**: `mise run check` (integration + schema)
- **PF Full**: `mise run full` (e2e + scenario matrix)

**GO Gate**:
- Scenario Matrix `S00-S15` green.
- `app.human_interactions` drift = 0.
- `app.run_steps` duplicate count = 0.

## 8. Appendix: Contract Snips

### Start Run (Canonical)
```json
{
  "recipeRef": { "id": "deploy-v2", "v": "1" },
  "formData": { "env": "prod" },
  "opts": { "lane": "interactive", "queuePartitionKey": "prod-1" }
}
```

### Event Reply
```json
{
  "payload": { "confirm": true },
  "dedupeKey": "dedupe-123",
  "origin": "manual"
}
```
