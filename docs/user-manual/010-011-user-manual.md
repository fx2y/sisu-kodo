# Sisu-Kodo Operator Manual (v0.10-0.11)

Deterministic control-plane for human-gated, async workflows. expert-only.

## 0. Preflight: Env & Topology

### Live Configuration
```bash
export BASE=http://127.0.0.1:3001
export APPV=v1.1.0
export OC_MODE=live            # record|replay|live
export SBX_MODE=live          # mock|live
export SBX_PROVIDER=e2b        # e2b|microsandbox
export WORKFLOW_RUNTIME_MODE=api-shim # api-shim (API) | inproc-worker (Worker)
export SBX_QUEUE_PARTITION=true
export OC_STRICT_MODE=1        # fail-closed on missing creds
```

### Split Deployment (Mandatory Topology)
1. **Worker (Execute):** `PORT=3001 WORKFLOW_RUNTIME_MODE=inproc-worker mise run start:worker`
2. **API-Shim (Enqueue):** `PORT=3001 WORKFLOW_RUNTIME_MODE=api-shim mise run start:api-shim`

---

## 1. The Laws (Invariants)

*   **Contract First:** Parser -> Service -> Repo -> Assert Egress. No unchecked casts.
*   **Oracle Order:** app.* SQL -> dbos.* SQL -> API JSON -> Logs (last).
*   **Queue Law:** Parent = `intentQ` only. Child = `sbxQ` only.
*   **Edge Law:** Enqueue requires `deduplicationID` OR `priority`. Missing => 400.
*   **Identity:** `intentId = ih_sha256(canon(intent))`. `workflowID = intentId`.
*   **HITL x1:** Tuple `(workflowID, gateKey, topic, dedupeKey)` + `origin` mandatory.
*   **Status Monotonic:** Terminal states (`SUCCESS|ERROR|CANCELLED`) never downgrade.
*   **Binary Signoff:** `GO` requires PF Green + Mandatory Proofs + No Rollback Triggers.

---

## 2. Operator Surfaces (The Boards)

| Board | Purpose | Key Access |
| :--- | :--- | :--- |
| **Run Console** | Primary execution view | `/?wid=<wid>&board=run` |
| **HITL Inbox** | Cross-run pending gates | `/?board=hitl-inbox` |
| **Ops Console** | Exact-six mutations | `/?board=ops` |
| **Recipe Reg** | Lifecycle & Pinned start | `/?board=recipe` |
| **Throughput** | Fairness/Backpressure | `/?board=throughput` |
| **Signoff** | Release Binary (GO/NO_GO) | `/?board=signoff` |

---

## 3. Scenarios & Walkthroughs

### S01: Canonical Run Start
**Obj:** Start workflow via pinned recipe.
1. Find recipe: `RID=$(psql -Atc "select id||'@'||v from app.recipe_versions where status='stable' limit 1")`
2. Launch:
```bash
curl -X POST $BASE/api/run -H 'Content-Type: application/json' -d "{
  "recipeRef": {"id": "${RID%@*}", "v": "${RID#*@}"},
  "formData": {"goal": "manual-op-01"},
  "opts": {"queuePartitionKey": "ops-default", "lane": "interactive"}
}"
```
*   **Result:** 202 Accepted + `workflowID`. Header includes `recipeHash` and `intentHash`.

### S02: Idempotency & Drift (409)
**Obj:** Assert fail-closed identity.
1. Repeat S01 exactly => 200/202 (Idempotent replay).
2. Repeat S01 with `lane: "batch"` => 409 Conflict.
*   **Proof:** UI renders "Conflict Panel" with field-diff (expected: interactive, incoming: batch).

### S04-06: HITL Lifecycle
**Obj:** Human approval with origin tracking.
1. Run enters `waiting_input` (Projected as `PENDING:APPROVE_PLAN`).
2. Read Gate: `curl $BASE/api/runs/$W/gates/$G?timeoutS=5`.
3. Reply (Manual):
```bash
curl -X POST $BASE/api/runs/$W/gates/$G/reply -d '{
  "payload": {"choice": "yes"},
  "dedupeKey": "op-token-01",
  "origin": "manual"
}'
```
4. Reply (API Event): `POST /api/events/hitl` with `origin: "api-shim"`.
*   **Proof:** `app.human_interactions` shows origin + topic/gate correlation.

### S07: Ops Mutation (Incident Response)
**Obj:** Terminate/Fork workflow.
1. Open Ops Console Drawer.
2. Select Action: `CANCEL`. Input `actor: "admin"`, `reason: "stuck_sbx"`.
3. Select Action: `FORK` (from Step 2).
*   **Result:** `app.artifacts` appends `step_id='OPS'` with structured audit trail.

### S08: Triage & Repro
**Obj:** Zero-trust diagnostic.
1. Open Run Board -> Proof Tab -> Repro Subtab.
2. Click "Generate Repro Pack".
3. Triage order:
    - `/healthz` (Infrastructure)
    - `/api/runs/$W` (Projection)
    - `app.runs` (Persistence)
    - `dbos.workflow_status` (Scheduler truth)
    - Repro JSON (History).

### S12-13: Recipe Registry & Patches
**Obj:** Verify immutability & reversibility.
1. Registry: Only `stable` recipes launch without override drift.
2. Patches: Run Board -> Patches Tab.
    - Inspect `preimage_hash` vs `postimage_hash`.
    - Observe `rolled_back_at` if post-apply failure triggered reverse-rollback.

### S15: Binary Signoff
**Obj:** Release decision.
1. Open `/?board=signoff`.
2. Inspect **PF Strip**: (quick, check, full, crashdemo).
3. Inspect **Rollback Triggers**:
    - `x1_drift`: Duplicate side-effects detected?
    - `terminal_divergence`: App vs Sys DB mismatch?
    - `false_green`: Mandatory tile missing evidenceRefs?
4. Verdict: Only `GO` if total green. No amber path.

---

## 4. Triage Oracle
1. **400:** Schema/Policy/Budget. check payload.
2. **404:** Missing Intent/Recipe. check IDs.
3. **409:** Identity/State drift. check dedupeKeys/status.
4. **500:** Unexpected. capture **Repro Pack** immediately.

**Finality Rule:** No mark `GO` from memory. Evidence must be SQL/API/Artifact-proven.
