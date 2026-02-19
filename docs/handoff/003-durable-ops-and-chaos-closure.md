# Cycle 3+ Closure: Durable Ops & Chaos Handoff

**Baseline:** February 2026 (Cycle C6 Rollout)
**Status:** SBX substrate v0 shipped; E2B default; Microsandbox (v1 parity stub) enabled via flag.

## 1. Core Mandates

- **Truth is SQL:** App truth in `app.*`, system truth in `dbos.*`. Logs are noise.
- **Identity:** `workflowID = intentId`. Exactly-once. Parallel starts converge.
- **Purity:** `src/workflow/wf` is deterministic. No IO/Date/Math/Random. Banned by `policy:wf-purity`.
- **Hard Seams:** Worker (executes) != Shim (enqueues). Isolated by `policy:shim-blackbox`.
- **Fail-Closed:** Invalid input/caps => 400. Rejection => zero DB writes.

## 2. Architecture: The Split Topology

- **Shim (`src/api-shim`):** Stateless. Enqueues to `dbos.workflow_status`. Reads `app.runs`.
- **Worker (`src/worker`):** Stateful. Registers all `@DBOS.workflow`. Dequeues and executes.
- **Sync:** Both MUST share `DBOS__APPVERSION`. Worker MUST import all workflows.

## 3. Step Durability & Forensics

Stable Step IDs are mandatory for timeline continuity and repair.

- `CompileST`: Source analysis.
- `ApplyPatchST`: Mutate state.
- `DecideST`: Decision envelope (OpenCode).
- `ExecuteST`: Side-effects (Sandbox/OC).

**Forensics SQL:**

```sql
-- Check for side-effect dups (should be 0)
SELECT COUNT(*) FROM app.mock_receipts WHERE seen_count > 1;

-- Inspect step timeline
SELECT step_id, status, output->>'attempt' as try
FROM app.run_steps WHERE run_id = 'run_xxx' ORDER BY created_at;

-- Verify OpenCode envelopes
SELECT step_id, request, response FROM app.opencode_calls WHERE run_id = 'run_xxx';

-- SBX child-task fanout audit (exactly-once)
SELECT task_key, COUNT(*) FROM app.sbx_runs GROUP BY task_key HAVING COUNT(*) > 1;

-- Artifact index integrity (SHA-256)
SELECT name, sha256 FROM app.artifacts WHERE run_id='run_xxx' AND step_id='ExecuteST' ORDER BY idx;
```

## 4. Recovery & HITL Lanes

- **Retries Exceeded:** Mapped to `status=retries_exceeded, next_action=REPAIR`.
- **Repair:** `POST /runs/:id/retry`. Resumes from first missing stable step. Uses `RepairRun` workflow.
- **HITL:** `POST /runs/:id/events`. Transitions `waiting_input -> running`. Uses `DBOS.recv('human-event')`.

## 5. Policy Gates (CI/Local)

- `mise run check`: Fast validation (lint, type, unit, integration).
- `mise run policy:wf-purity`: Regex-ban entropy/IO in `src/workflow/wf`.
- `mise run policy:shim-blackbox`: Ban shim imports from `src/workflow`.
- `mise run policy:task-sources`: Enforce `sources/outputs` in `mise.toml`.

## 6. Walkthroughs

### 6.1 Bootstrap & Launch

```bash
# 1. Reset everything
mise run db:reset && mise run db:sys:reset && mise run build

# 2. Start Worker (Term A)
PORT=3001 DBOS__APPVERSION=v1 mise run start:worker

# 3. Start Shim (Term B)
PORT=3001 DBOS__APPVERSION=v1 mise run start:api-shim
```

### 6.2 The Intent Lifecycle

```bash
BASE=http://localhost:3001

# 1. Create Intent
IID=$(curl -sS -X POST $BASE/intents -d '{"goal":"demo","inputs":{}}' -H 'Content-Type: application/json' | jq -r .intentId)

# 2. Trigger Run (Deterministic WorkflowID=IID)
RID=$(curl -sS -X POST $BASE/intents/$IID/run -d '{"recipeName":"compile-default"}' -H 'Content-Type: application/json' | jq -r .runId)

# 3. Poll Status
curl -sS $BASE/runs/$IID | jq '{status,lastStep,retryCount}'
```

### 6.3 Chaos & Durability Proof

```bash
# Force-kill worker during ExecuteST, restart, assert convergence
# Invariant: ExecuteST attempt=1 in app.run_steps
mise run -f wf:intent:chaos
```

### 6.4 Repair/Retry Path

```bash
# 1. Find a failed run
FID=$(curl -sS $BASE/runs | jq -r '.[] | select(.status=="retries_exceeded") | .workflowId' | head -n 1)

# 2. Trigger Repair
curl -sS -X POST $BASE/runs/$FID/retry | jq
# => { "accepted": true, "newRunId": "run_...", "fromStep": "ExecuteST" }
```

### 6.5 HITL Wait/Signal

```bash
# 1. Start run that asks user
IID_ASK=$(curl -sS -X POST $BASE/intents -d '{"goal":"ask user"}' ... | jq -r .intentId)
# ... wait for status="waiting_input" ...

# 2. Signal event
curl -sS -X POST $BASE/runs/$IID_ASK/events -d '{"type":"input","payload":{"answer":"ok"}}' -H 'Content-Type: application/json'
```

## 7. Operational Shortcuts

- `mise run dbos:workflow:list`: List active workflows.
- `mise run dbos:workflow:status <WID>`: System-level status.
- `mise run dbos:workflow:steps <WID>`: DBOS step log.
- `mise run sbx:live:smoke`: Verify default provider (E2B) path.
- `SBX_PROVIDER=microsandbox SBX_ALT_PROVIDER_ENABLED=true mise run sbx:live:smoke`: Verify alt provider stub path.
- `scripts/db/psql-sys.sh`: Raw access to system DB.

## 8. Triage & Troubleshooting

- **Run sticks in `queued`:** Worker not running or `DBOS__APPVERSION` mismatch between shim/worker.
- **`healthz` down:** Check if both `PORT` and `ADMIN_PORT` are correctly bound.
- **Events 409:** Run is not in `waiting_input` state.
- **Retry 409:** Only `retries_exceeded` or `failed` runs can be retried.
- **Duplicate Receipts > 0:** Treat as durability regression. Check `app.mock_receipts` by `run_id`.
- **EADDRINUSE in tests:** Integration tests use dedicated ports. Ensure previous runs are cleaned up with `mise run stop`.

## 9. Expansion & Next Steps

- **New Step implementation:** Add to `src/workflow/steps`, then wrap in `src/workflow/dbos/intentSteps.ts`.
- **New Workflow:** Add to `src/workflow/wf`, then register in `src/worker/main.ts` and `src/workflow/dbos/intentWorkflow.ts`.
- **Contract Updates:** Centralized in `src/contracts`. Always run `mise run type` after changes.
- **Soak Testing:** Use `-f` flag to bypass mise cache: `mise run -f sandbox:soak`.
