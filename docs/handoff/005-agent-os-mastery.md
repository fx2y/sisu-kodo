# Agent OS Mastery: Durable Substrate & Fanout Hardening

Expert-level procedural guide for maintaining and extending the sisu-kodo workflow engine.

## 1. Doctrine: The Hard Laws

- **Workflow Identity:** `workflowID == intentId`. Single-intent-single-workflow singleton.
- **Stable Steps:** `CompileST` -> `ApplyPatchST` -> `DecideST` -> `ExecuteST`. No ad-hoc steps.
- **Seams:** Parent WFs **MUST** run on `intentQ`. Fanout children **MUST** run on `sbxQ`.
- **Exactly-Once:** Enforced by DB-level idempotency (`ON CONFLICT DO NOTHING`) and DBOS workflow handles.
- **Determinism:** No raw `Math.random|Date.now` in business logic. Use `canonicalStringify` + `sha256`.
- **Failure Posture:** Fail-closed > throughput. Deterministic `400` + zero writes on contract breach.

## 2. SQL Oracle: The Source of Truth

Query these tables; never trust log files.

- `app.runs`: Intent lifecycle metadata.
- `app.run_steps`: Durable step outputs (`CompileST`, etc.).
- `app.sbx_runs`: Sandbox execution records keyed by `(run_id, step_id, task_key)`.
- `app.artifacts`: Deterministic artifact index and content records.
- `dbos.workflow_status`: Scheduler state, queue depth, and partition keys.

## 3. Core Walkthroughs (Labs)

### L00: Bootstrap Baseline

```bash
mise install && mise run db:up && mise run db:reset && mise run db:sys:reset && mise run build && mise run quick
```

_Expect: Green status, schemas reset, policy gates passing._

### L02: Happy Path Monolith

```bash
# Start server
PORT=3001 ADMIN_PORT=3002 OC_MODE=replay SBX_MODE=mock mise run start

# In separate shell:
BASE=http://127.0.0.1:3001
INTENT=$(curl -sS -X POST $BASE/intents -d '{"goal":"demo","inputs":{},"constraints":{}}' | jq -r .intentId)
RUN=$(curl -sS -X POST $BASE/intents/$INTENT/run -d '{"recipeName":"sandbox-default","queuePartitionKey":"tenant-1"}' | jq -r .runId)

# Wait for HITL approval
curl -sS -X POST $BASE/runs/$RUN/approve-plan -d '{"approvedBy":"po"}'
```

### L08: Fanout Exactly-Once Proof

```bash
mise run -f sandbox:fanout:soak
# Verify SQL Oracle: No duplicate task_key executions
docker compose exec -T db psql -U postgres -d app_local -c
  "SELECT task_key, COUNT(*) FROM app.sbx_runs GROUP BY task_key HAVING COUNT(*) > 1;"
```

### L13: Intent Chaos Durability

```bash
mise run -f wf:intent:chaos
# Verify: 0 duplicate side-effects (mock_receipts seen_count == 1)
docker compose exec -T db psql -U postgres -d app_local -c
  "SELECT COUNT(*) FROM app.mock_receipts WHERE seen_count > 1;"
```

## 4. Operational Runbook

### Triage: Stuck Workflows

1. Check `dbos.workflow_status`: `SELECT status, queue_name FROM dbos.workflow_status;`
2. Verify `DBOS__APPVERSION` parity between Shim and Worker.
3. Check `intentQ` depth; ensure worker is consuming.

### Port Management

- Standard: `PORT=3001`, `ADMIN_PORT=3002`.
- E2E/Soak Lanes: Always use isolated ports (e.g., `3004/3006`) to avoid `EADDRINUSE`.

### Resetting State

- `mise run db:reset`: Clears `app.*` tables (runs, artifacts).
- `mise run db:sys:reset`: Clears `dbos.*` tables (queue state, history). **CRITICAL** for chaos tests.

## 5. Contract Implementation

Standard pattern for adding new sandbox capabilities:

1. Update `src/contracts/sbx/sbx-req.schema.ts`.
2. Plumb through `src/workflow/wf/run-intent.wf.ts` `buildTasks` helper.
3. Implement in `RunInSBXPort` provider (e.g., `src/sbx/e2b.ts`).
4. Add integration proof in `test/integration/`.

## 6. Ship Checklist

- [ ] `mise run quick && mise run check && mise run full` green.
- [ ] `mise run -f wf:intent:chaos:soak` (5+ passes) green.
- [ ] `mise run -f sandbox:soak` (100+ tasks) green.
- [ ] `REFRESH_GOLDEN=1 mise run test:golden:refresh` (if schema changed).

## 7. C6 UI Durability Runbook (2026-02-19)

### Launch stack (three terminals)

```bash
mise install
mise run db:up
mise run db:reset && mise run db:sys:reset && mise run build
```

```bash
# Term A: worker
PORT=3001 ADMIN_PORT=3002 DBOS__APPVERSION=v1 OC_MODE=replay SBX_MODE=mock mise run start:worker
```

```bash
# Term B: API shim
PORT=3001 ADMIN_PORT=3002 DBOS__APPVERSION=v1 OC_MODE=replay SBX_MODE=mock mise run start:api-shim
```

```bash
# Term C: UI (rewrites /api/* -> http://127.0.0.1:3001/api/*)
pnpm dev:ui
```

Open `http://127.0.0.1:3000/`, start one run, and copy `workflowID` (`wid`) from the header.

### Kill and restart proof on same `workflowID`

```bash
# Kill active worker process mid-run
pkill -f "src/worker/main.ts" || true
```

```bash
# Restart worker with same app version
PORT=3001 ADMIN_PORT=3002 DBOS__APPVERSION=v1 OC_MODE=replay SBX_MODE=mock mise run start:worker
```

Expected: UI remains on same URL `/?wid=<wid>`, timeline continues without client reset, terminal status appears.

### SQL oracle pack (exact queries)

```bash
WID="<workflow_id_from_ui>"
RUN_ID=$(docker compose exec -T db psql -tA -U postgres -d app_local -c "SELECT id FROM app.runs WHERE workflow_id='${WID}' ORDER BY created_at DESC LIMIT 1;" | tr -d '\r' | xargs)
```

```sql
-- app.runs projection for this workflow
SELECT id, workflow_id, status, trace_id, updated_at
FROM app.runs
WHERE workflow_id = '<wid>';

-- app.run_steps timeline monotonicity
SELECT step_id, attempt, phase, started_at, finished_at, trace_id, span_id
FROM app.run_steps
WHERE run_id = '<run_id>'
ORDER BY started_at NULLS LAST, step_id, attempt;

-- app.artifacts durability surface (>=1 artifact or explicit none)
SELECT step_id, attempt, idx, kind, uri, sha256
FROM app.artifacts
WHERE run_id = '<run_id>'
ORDER BY step_id, attempt, idx;

-- dbos scheduler truth
SELECT workflow_uuid, status, queue_name, queue_partition_key, started_at_epoch_ms
FROM dbos.workflow_status
WHERE workflow_uuid = '<wid>';

-- exactly-once side-effect oracle
SELECT COUNT(*) AS duplicate_receipts
FROM app.mock_receipts
WHERE run_id = '<run_id>' AND seen_count > 1;
```
