# Handoff 006: Durable UI & Proof Release

Cycle C6 complete. System is in GO state for Feb-20-2026 baseline. UI is a thin, deterministic projection of Postgres truth.

## 1. Architecture: Split Topology

- **Next.js App Router (Port 3000):** Owns UI (`/`) and API (`/api/**`). Thin bridge to DB via `src/server/ui-api.ts`.
- **DBOS Worker (Separate Process):** Owns Workflow (WF) and Step (ST) execution. No UI logic here.
- **Durable Truth:** `app.runs`, `app.run_steps`, `app.artifacts`. Memory/logs are never the oracle.

## 2. Strict Invariants (Non-Negotiable)

1.  **Identity:** `workflowID == intentId`. Starting a run for an existing `intentId` is idempotent (no status downgrade).
2.  **Fixed DAG:** `CompileST` -> `ApplyPatchST` -> `DecideST` -> `ExecuteST`.
3.  **Fail-Closed:** Single Ajv kernel (`src/contracts/ajv.ts`). Unknown fields in `/api` requests => 400.
4.  **Exactly-Once:** DB marks (PK: `run_id`, `step_id`, `task_key`, `attempt`) prevent duplicate side-effects.
5.  **Artifact Sentinels:** Steps with zero domain output MUST emit `kind:none` (idx: 999) for timeline feedback.
6.  **Polling Stop:** UI poller MUST stop within one tick of reaching terminal status.

## 3. API Surface (`/api/**`)

Routes use `src/server/ui-api.ts` service bridge.

- `POST /api/intents`: Register goal/inputs.
- `POST /api/runs`: Start execution. Requires `intentId`. Strict mode requires `queuePartitionKey`.
- `GET /api/runs/:wid`: Current header (status, nextAction, traceId).
- `GET /api/runs/:wid/steps`: Timeline rows. Merges DBOS `listWorkflowSteps` (real-time) with `app.run_steps` (durable).
- `POST /api/runs/:wid/approve-plan`: HITL gate opener.
- `GET /api/artifacts/:id`: Binary stream with kind-based MIME derivation.

## 4. Walkthroughs (The "How-To")

### A. The Standard Path (Happy Path)

1. Open `http://localhost:3000`.
2. Input goal (e.g., "Build a component"). Click **Run**.
3. **Timeline:** Watch steps transition from `ENQUEUED` -> `PENDING` -> `SUCCESS`.
4. **Artifacts:** Click `json` or `svg` tags to open the **Artifact Sheet**.

### B. HITL Gate (Human-In-Loop)

1. Start a run. Workflow hits `waitForPlanApproval` after `ApplyPatchST`.
2. UI shows `ShieldCheck` banner: **Plan Approval Required**.
3. Click **Approve Plan**.
4. Workflow resumes: `DecideST` -> `ExecuteST`.

### C. Durability Proof (Kill/Restart)

1. Start a run. While `ExecuteST` is running (blue pulse), kill the worker process (`ctrl+c` or `pnpm stop`).
2. Refresh UI. Banner shows **Durability Active**.
3. Restart worker (`pnpm dev:worker`).
4. Workflow resumes from `ExecuteST` (or repair) on the **same workflowID**.

### D. Recovery (Repair Workflow)

1. If a run hits `retries_exceeded`, UI shows **REPAIR** nextAction.
2. Trigger repair via API: `POST /api/runs/:wid/repair`.
3. System re-runs failed steps using stable checkpoints.

## 5. Troubleshooting & Triage

- **Timeline Empty?** Check `GET /api/runs/:wid` first. If 404, WID is wrong. If 200, check if worker is running.
- **400 on Run Start?** Strict mode (`SBX_QUEUE_PARTITION=true`) requires `queuePartitionKey` in payload.
- **Stale Timeline?** Check `app.run_steps`. If DB is ahead of UI, the poller might have crashed (check console).
- **Duplicate Receipts?** Run `SELECT COUNT(*) FROM app.mock_receipts WHERE seen_count > 1;`. If > 0, exactly-once is broken.

## 6. Projections & Logic

- **Status Mapping:** `DBOS status` (running) -> `UI status` (PENDING). Terminal states are driven by `app.runs.status`.
- **Trace Links:** Optional. Requires `TRACE_BASE_URL` with `{traceId}` tokens.
- **Split Topology:** Shim/Worker must share `DBOS__APPVERSION` to avoid version-mismatch enqueuing.

## 7. Signoff Floor

- `mise run quick`: Basic contracts/policy.
- `mise run full`: Chaos/Fanout/Durability soaks.
- `scripts/wf-ui-durability.sh`: The automated proof of C4/C6 invariants.
