# Sisu-Kodo Operator Manual: Cycles 08-09

Expert-grade field guide for the Recipe-Driven Flywheel and HITL Gate system. 

## 0. Live Environment Configuration
Mandatory baseline for production-parity operations.

```bash
# Core Topology
export DBOS__APPVERSION=v1
export WORKFLOW_RUNTIME_MODE=api-shim # or inproc-worker
export PORT=3001
export ADMIN_PORT=3002

# Provider Ingress
export OC_MODE=live
export OC_BASE_URL=https://api.opencode.ai
export SBX_MODE=live
export SBX_PROVIDER=e2b
export SBX_QUEUE_PARTITION=true
```

## 1. Identity & Kernel Laws
*   **Run Identity:** `workflowID = intentId = ih_<sha256(canonical(intent))>`. 
*   **Gate ABI:** Frozen keys `ui:<g>`, `ui:<g>:result`, `decision:<g>`. Topics `human:<g>`.
*   **History:** Append-only `run_steps`, `artifacts`, `human_interactions`.
*   **Exactly-Once:** SQL `ON CONFLICT DO NOTHING` + semantic divergence guards.
*   **Lattice:** 400 (Validation), 404 (Missing), 409 (Conflict/State), 500 (System).

## 2. Recipe & Intent Operations
### 2.1 Recipe Ingress (The Configuration Plane)
Recipes are immutable once `stable`.
```bash
# 1. Import bundle (Draft status)
curl -X POST $URL/api/recipes/import -d @bundle.json

# 2. Promote to Stable (Enables /api/run)
# Use internal helper or SQL for promotion (requires eval+fixtures pass)
scripts/db/psql-app.sh -c "UPDATE app.recipe_versions SET status='stable' WHERE id='r1' AND v='1.0.0';"
```

### 2.2 Intent Execution (The Product Path)
Deterministic instantiation from `recipeRef` + `formData`.
```bash
# Start Run (Idempotent by intentHash)
curl -X POST $URL/api/run -H "Content-Type: application/json" -d '{
  "recipeRef": {"id": "seed.r01", "v": "1.0.0"},
  "formData": {"topic": "alpha"},
  "opts": {"queuePartitionKey": "p1"}
}'
```

## 3. HITL Gate Walkthroughs
### Scenario A: Standard Approval
1.  **Detect:** Run status=`waiting_input`. 
2.  **Locate:** `GET /api/runs/:wid/gates` -> returns `gateKey`.
3.  **Inspect:** `GET /api/runs/:wid/gates/:gateKey?timeoutS=5`.
4.  **Action:** 
    ```bash
    curl -X POST $URL/api/runs/:wid/gates/:gateKey/reply -d '{
      "payload": {"choice": "yes", "rationale": "Proceed"},
      "dedupeKey": "op-id-001",
      "origin": "manual"
    }'
    ```

### Scenario B: Webhook Ingress (Machine-to-Machine)
Bypasses UI; hits same ledger/dedupe lane.
```bash
curl -X POST $URL/api/events/hitl -d '{
  "workflowId": ":wid",
  "gateKey": ":gateKey",
  "topic": "human::gateKey",
  "payload": {"choice": "yes"},
  "dedupeKey": "webhook-id-123",
  "origin": "api-shim"
}'
```

### Scenario C: Timeout & Escalation
*   Gates have `ttlS`. If expired, system emits `ui:<g>:result` with `state: TIMED_OUT`.
*   Triggers `EscalateTimeout` on `controlQ` (Dedupe: `esc::wid::gateKey`).
*   Late replies after timeout return **409 Conflict**.

## 4. The Flywheel: Auto-Improve Loop
Failed runs trigger a self-correction cycle.

1.  **Failure:** `ExecuteST` fails.
2.  **Postmortem:** `PostmortemST` (Plan agent) identifies `rootCause`.
3.  **Patch:** `PatchGenST` (Build agent) generates reversible patch.
4.  **Approval:** `awaitHuman` for patch application.
5.  **Apply/Rollback:**
    *   **Accept:** `ApplyPatchST` applies diff; persists preimage hash.
    *   **Reject:** `ApplyPatchST` rolls back to preimage.
6.  **Verify:** `FixturesQ` runs 2x runs (Flake detection).
7.  **Publish:** Transactional bump to `stable` + `active_v` update.

## 5. Triage & Evidence (FDE/Expert)
### 5.1 The Repro-Pack
Atomic snapshot of the entire execution tree.
```bash
pnpm exec tsx scripts/repro-pack.ts --run :wid --out snapshot.json
```
Snapshot includes: `intent`, `runSteps`, `artifacts`, `evalResults`, `humanInteractions`, and `dbos.workflow_events`.

### 5.2 SQL Oracle Queries
Fast-path verification.
```sql
-- Interaction Integrity
SELECT workflow_id, gate_key, dedupe_key, origin 
FROM app.human_interactions WHERE workflow_id = ':wid';

-- Step Convergence (No Duplicates)
SELECT step_id, count(*) FROM app.run_steps 
WHERE run_id = ':runId' GROUP BY 1 HAVING count(*) > 1;

-- Queue Fairing (System DB)
SELECT workflow_uuid, status, queue_name, queue_partition_key 
FROM dbos.workflow_status WHERE workflow_uuid = ':wid';
```

## 6. Operational Pitfalls
*   **Clock-Derived Dedupe:** Forbidden. Replays will fail. Nonce must be stable per gate-intent.
*   **Mismatched AppVersion:** Shim and Worker must share `DBOS__APPVERSION` or recovery fails.
*   **Bespoke Branches:** Goal-string checks in WF code are P0 violations; use recipe data.
*   **Silent Fallback:** 500s are bugs. Expect 400 on malformed JSON or schema drift.
