# Sisu-Kodo Ops Manual: Cycles 02-03

Expert-grade guide for the Sisu-Kodo durable execution engine.

## 0. Runtime Kernels
- **Truth:** SQL rows (`app.*` + `dbos.*`), never logs.
- **Identity:** `workflowID == intentId` (Exactly-once).
- **Topology:** Split `api-shim` (enqueue/read) vs `worker` (execution).
- **Purity:** `src/workflow/wf/` is control-only; `src/workflow/steps/` owns I/O.

## 1. Environment & Bootstrap
```bash
# Core Pins
export NODE_VERSION=24
export PG_VERSION=18.2
export DBOS__APPVERSION=v1

# Setup
mise install
mise run db:reset && mise run db:sys:reset
mise run build
```

## 2. Walkthrough A: Foundation Durability (Crash-Demo)
**Goal:** Prove `kill -9` convergence to exactly-once markers.
1. **Trigger:** `PORT=3004 ADMIN_PORT=3006 mise run -f wf:crashdemo`
2. **Action:** Script kills process mid-sleep, restarts, and resumes.
3. **Oracle:**
   - `SUCCESS` in `dbos.workflow_status`.
   - `app.marks` counts: `{s1:1, s2:1}`.

## 3. Walkthrough B: Intent Run Loop (Split Topology)
**Goal:** Run canonical chain (`Compile->Apply->Decide->Execute`) across shim/worker.
1. **Launch Worker:** `PORT=3001 ADMIN_PORT=3002 mise run start:worker` (Terminal A).
2. **Launch Shim:** `PORT=3001 ADMIN_PORT=3002 mise run start:api-shim` (Terminal B).
3. **Ingress:**
   ```bash
   # Create Intent
   I_ID=$(curl -s -X POST :3001/intents -d '{"goal":"demo","inputs":{},"constraints":{}}' -H 'Content-Type: application/json' | jq -r .intentId)
   # Trigger Run (W_ID == I_ID)
   R_ID=$(curl -s -X POST :3001/intents/$I_ID/run -d '{"traceId":"ops-01"}' -H 'Content-Type: application/json' | jq -r .runId)
   ```
4. **Observe:** `curl -s :3001/runs/$I_ID | jq`
   - Expect `status: succeeded`.
   - Steps: `CompileST`, `ApplyPatchST`, `DecideST`, `ExecuteST`.

## 4. Walkthrough C: Policy & Queue Knobs
**Goal:** Prove priority, deduplication, and fail-closed constraints.
1. **Dedupe:** Submit same `deduplicationID` twice -> 2nd returns `409` or joins existing.
2. **Priority:** Enqueue 10 `batch` jobs, then 1 `interactive` with `priority: 10` -> Interactive jumps queue.
3. **Fail-Closed:** Submit `concurrency: 999` workload -> `400 queue_policy_violation` + zero DB writes.

## 5. Walkthrough D: HITL & DLQ Repair
**Goal:** Handle `waiting_input` and resume from `retries_exceeded`.
1. **HITL Flow:**
   - Submit intent with "ask" goal.
   - Run reaches `status: waiting_input`.
   - Ingress event: `curl -X POST :3001/runs/$I_ID/events -d '{"type":"input","payload":{"answer":"42"}}'`.
   - Status transitions `running -> succeeded`.
2. **Repair Flow:**
   - Trigger failing run (e.g., net timeout).
   - Reaches `status: retries_exceeded`, `next_action: REPAIR`.
   - Repair: `curl -X POST :3001/runs/$I_ID/retry`.
   - Resumes from last successful step via persisted checkpoints.

## 6. Walkthrough E: Chaos & Forensic Audit
**Goal:** Validate zero duplicate side-effects under failure.
1. **Chaos:** `mise run -f wf:intent:chaos`. Worker killed during `ExecuteST`.
2. **Audit:**
   ```sql
   -- Duplicate side-effect check
   SELECT seen_count FROM app.mock_receipts WHERE seen_count > 1; -- Must be 0
   -- Persistence check
   SELECT step_id, request, response FROM app.opencode_calls;
   ```

## 7. Triage Table
| Symptom | Check | Fix |
| :--- | :--- | :--- |
| `healthz` Down | Proc list | Ensure both `worker` and `shim` share `PORT`/`ADMIN_PORT`. |
| Run Stuck `queued` | `dbos.workflow_status` | Worker down or `DBOS__APPVERSION` mismatch. |
| Event `409` | `RunView` status | Target must be `waiting_input`. |
| ID Collision | `app.intents` | Ensure `mise run stop` cleared stale processes. |
| Policy Red | `scripts/policy-*` | Check for `Date.now()`, `Math.random()`, or `fs` in `wf/`. |
