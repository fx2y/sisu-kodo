# Sisu-Kodo 004-005 Expert Walkthrough

## 1. Core Doctrine (The "Must" List)
- **Identity:** `workflowID == intentId`. Identity tuple: `(intentId, runId, stepId, attempt)`.
- **Seams:** Only `src/oc/**` touches @opencode-ai/sdk. Only `src/sbx/**` touches VM provider.
- **Persistence:** `runTrackedStep` persists output *before* return. Monotonic status.
- **Fail-Closed:** 400 on invalid JSON/Schema/Policy. Zero writes on reject.
- **Idempotence:** `op_key` (OC) and `taskKey` (SBX) UNIQUE constraints + `ON CONFLICT DO NOTHING`.
- **Determinism:** `RANDOM_SEED` required. `Date.now` and `Math.random` banned in core.

## 2. Implementation Walkthrough (Expert Path)

### 004: OpenCode (OC) Integration
1.  **Daemon Pinning:** `opencode.json` + `opencode.version`. Managed via `oc:daemon:up`.
2.  **Wrapper Floor:** `OCClientPort` abstraction. Ledger v2 captures `timings`, `tool_calls`, and `raw_text`.
3.  **Structured Compile:** `CompileST` uses `json_schema` to emit `PlanOutput`. No side effects here.
4.  **Approval Gate:** `DecideST` hits `plan_not_approved` -> `waiting_input`. `POST /approve-plan` flips `app.plan_approvals`.
5.  **Hardening:** `stall-detector` (<30s) + `timeout-policy` (revert turn, shrink scope).

### 005: Sandbox (SBX) Substrate
1.  **Contract Kernel:** `SBXReq` -> `SBXRes`. `taskKey = SHA256(canonical(req))`.
2.  **Provider Split:** `RunInSBXPort`. Default `e2b` v0. `mock` for CI.
3.  **Durable Exec:** `ExecuteST` persists `app.sbx_runs` and `app.artifacts` before completion.
4.  **Queue Fanout:** `ExecutePlanWF` spawns N `TaskWF` child workflows on `sbxQ`.
5.  **Streaming:** `DBOS.writeStream` per `taskKey`. Terminal `stream_closed` event.

## 3. Operations Manual (SSOT Operator)

### B1: Bootstrap & Health
```bash
# Set base env
export RANDOM_SEED=42 OC_MODE=live SBX_MODE=live SBX_PROVIDER=e2b

# Start infra
mise run oc:daemon:up
mise run db:reset && mise run db:sys:reset
mise run start # Monolith mode
```

### B2: Triage Oracle (SQL Truth)
```sql
-- Check for duplicate effects (S0 regression)
SELECT seen_count, COUNT(*) FROM app.mock_receipts WHERE seen_count > 1 GROUP BY 1;

-- Audit OC ledger drift
SELECT op_key, agent, err_code FROM app.opencode_calls WHERE error IS NOT NULL;

-- Monitor SBX throughput/latency
SELECT percentile_cont(0.95) WITHIN GROUP (ORDER BY (metrics->>'wallMs')::int) FROM app.sbx_runs;
```

### B3: Manual Repair
```bash
# 1. Detect retries_exceeded
curl -s "$BASE/runs/$R" | jq '.status'

# 2. Force retry from last stable step
curl -X POST "$BASE/runs/$R/retry" | jq
```

## 4. End-User Walkthrough (Value Stream)

### U1: Launching Intent
Users submit high-level goals. The system immediately enqueues an `intentQ` job.
```bash
curl -X POST $BASE/intents -d '{"goal": "Fix auth bug in src/api.ts"}'
```

### U2: Reviewing & Approving Plan
The system generates a plan card (CompileST). User must sign off before any file edits occur.
```bash
# 1. Poll for waiting_input
# 2. Read plan_card artifact via artifactIndexRef
# 3. Approve
curl -X POST $BASE/runs/$R/approve-plan -d '{"approvedBy": "alice"}'
```

### U3: Real-time Progress
Users watch live stdout/stderr streams from parallel sandboxes.
```bash
# Listen to DBOS notifications on topic 'sbx:<taskKey>'
```

## 5. Code Enriched Snippets

### OC Ledger v2 Upsert
```typescript
// src/db/opencodeCallRepo.ts
async insert(call: OCEnvelope) {
  return this.client.execute(`
    INSERT INTO app.opencode_calls (op_key, run_id, request, response, error)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (op_key) DO NOTHING
  `, [call.opKey, call.runId, call.req, call.res, call.err]);
}
```

### SBX Fanout (ExecutePlanWF)
```typescript
// src/workflow/wf/run-intent.wf.ts
static async run(plan: Plan) {
  const handles = await Promise.all(plan.tasks.map(t => 
    DBOS.startChildWorkflow(TaskWF.run, {
      queueName: 'sbxQ',
      enqueueOptions: { deduplicationID: t.taskKey, queuePartitionKey: t.tenantId }
    })(t)
  ));
  return Promise.all(handles.map(h => h.getResult()));
}
```

### Fail-Closed Boundary Gate
```typescript
// scripts/policy-sbx-boundary.sh
bad=$(rg -n 'exec\(|spawn\(' src | rg -v '^src/sbx/')
[[ -z "$bad" ]] || { echo "Breach: $bad"; exit 1; }
```

## 6. Environment Configuration (Live)
| Var | Value | Purpose |
| :--- | :--- | :--- |
| `OC_SERVER_PORT` | `4096` | OC Daemon Port |
| `OC_MODE` | `live` | Disable mock fixture adapter |
| `SBX_MODE` | `live` | Real VM sandbox provider |
| `SBX_PROVIDER` | `e2b` | Provider selection |
| `RANDOM_SEED` | `any-string` | Deterministic behavior |
| `DBOS__APPVERSION` | `v1` | Topology parity check |
