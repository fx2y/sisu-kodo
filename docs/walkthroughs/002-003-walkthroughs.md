# Sisu-Kodo 002-003 Master Walkthrough

## 0. Live Environment Setup
**Prerequisites:** Node 24, PG 18.2, `mise`.
```bash
# Set base environment
export PORT=3001
export ADMIN_PORT=3002
export DBOS__APPVERSION=v1
export DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54329/app_local
export DBOS_SYSTEM_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54329/app_dbos_sys

# Initial Bootstrap
mise install
mise run db:reset && mise run db:sys:reset
mise run build
```

---

## 1. Walkthrough 002: Durable Kernel
**Goal:** Prove `s1=1,s2=1` oracle under crash/restart via DBOS steps.

### T2.1: Crash Demo (Canary)
```bash
# Start and kill mid-run
PORT=3004 ADMIN_PORT=3006 mise run -f wf:crashdemo
# Oracle check (app.marks must have exactly one s1, one s2)
docker compose exec -T db psql -U postgres -d app_local -c "SELECT * FROM app.marks;"
# DBOS status check
mise run dbos:workflow:status <wf_id>
```

### T2.2: Schema Split Audit
```bash
# Verify app/sys separation
scripts/db/psql-sys.sh -c '\dt dbos.*' # Only system tables
docker compose exec -T db psql -U postgres -d app_local -c '\dt app.*' # Only product tables
```

---

## 2. Walkthrough 003: Agent OS (Split Topology)
**Goal:** Run production-grade intent chain with `workflowID=intentId`.

### T3.1: Launch Topology
*   **TERM-A (Worker):** Executes workflows. `mise run start:worker`
*   **TERM-B (Shim):** API ingress only. `mise run start:api-shim`

### T3.2: Canonical Chain Execution
```bash
BASE=http://127.0.0.1:3001
# 1. Create Intent
I1=$(curl -sS -X POST $BASE/intents -d '{"goal":"demo","inputs":{},"constraints":{}}' | jq -r .intentId)
# 2. Trigger Run (Exactly-Once Identity)
R1=$(curl -sS -X POST $BASE/intents/$I1/run -d '{"traceId":"op-1"}' | jq -r .runId)
# 3. Monitor Status (Dual-read: runId or workflowId)
curl -sS $BASE/runs/$I1 | jq '{status,lastStep,steps:[.steps[].stepId]}'
# Expect: status=succeeded, steps=[CompileST, ApplyPatchST, DecideST, ExecuteST]
```

### T3.3: HITL & Repair (Value Extraction)
```bash
# 1. Start HITL-blocking intent
I2=$(curl -sS -X POST $BASE/intents -d '{"goal":"ask user","inputs":{},"constraints":{}}' | jq -r .intentId)
curl -sS -X POST $BASE/intents/$I2/run -d '{}'
# 2. Wait for 'waiting_input'
# 3. Send reply (End-user interaction)
curl -sS -X POST $BASE/runs/$I2/events -d '{"type":"input","payload":{"answer":"OK"}}'
# 4. Handle Failure (Dead-letter Repair)
# If status=retries_exceeded:
curl -sS -X POST $BASE/runs/$I2/retry | jq # Resume from last checkpoint
```

---

## 3. Operations & Forensic Playbook (SSOT)

### Chaos Proof (FDE/QA)
```bash
# Prove zero duplicate side effects under kill -9
mise run -f wf:intent:chaos
# Audit mock receipts (must be zero duplicates)
docker compose exec -T db psql -tA -U postgres -d app_local -c "SELECT COUNT(*) FROM app.mock_receipts WHERE seen_count > 1;"
```

### Operator Forensics
*   **List Queued:** `mise run dbos:workflow:queue:list`
*   **Detailed Steps:** `mise run dbos:workflow:steps <id>`
*   **Artifact Inspection:**
```bash
docker compose exec -T db psql -U postgres -d app_local -c "SELECT * FROM app.opencode_calls WHERE run_id='<runId>';"
```

---

## 4. End-User Value Guide
1.  **Guaranteed Idempotency:** Users can safely retry POST `/intents/:id/run` without fear of double-execution.
2.  **Durable Resume:** If the worker crashes, the user's run resumes exactly where it left off.
3.  **Interactive Loop:** Users get a `waiting_input` status for human-in-the-loop decisions, unlocked via the `/events` endpoint.
4.  **Forensic Transparency:** Every step (`CompileST`, `ExecuteST`) and its artifacts are visible via the `/runs/:id` projection.

---

## 5. Architectural Snippets (Policy Kernel)

### WF Purity Gate
```typescript
// scripts/policy-wf-purity.sh
// Ban Date.now(), Math.random(), fs, net in src/workflow/wf/**
rg -n 'Date\.now|Math\.random|fs\.|net\.' src/workflow/wf/ && exit 1 || exit 0
```

### Exactly-Once Start (StartIntentRun)
```typescript
export const StartIntentRun = (intentId: string) => 
  DBOS.startWorkflow(RunIntentWF, {
    workflowID: intentId, // identity lock
    queueName: 'intentQ'
  })(intentId);
```

### Reversible Patch Guard
```typescript
// Guard current == pre_hash before apply
const ok = await tx.query("UPDATE app.run_steps SET ... WHERE pre_hash=$1", [current]);
if (ok.rowCount === 0) throw new ConflictError("Drift detected");
```
