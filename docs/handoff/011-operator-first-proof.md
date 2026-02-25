# Sisu-Kodo Handoff: Spec-0/11 Operator-First Proof

## 🚨 Status: Binary NO_GO

- **Verdict**: `NO_GO` until `T32` (Scenario Matrix `spec11-scenario-matrix.test.ts`) ships and `T40` closure rerun.
- **Truth Order**: `app SQL` -> `dbos SQL` -> `API JSON` -> `logs(last)`.
- **Primary Surface**: `/?board=signoff`. Treat other boards as convenience; verify claims in SQL.

## ⚖️ Architectural Laws

- **Law.Contract**: One Ajv kernel (`src/contracts/**`). Boundary order: `ingress -> db-load -> step-out -> egress`. No boundary casts.
- **Law.Det**: No `Date.now()`, `Math.random()`, or `UUID` in workflows. Use `DBOS.workflowId` and `DBOS.send`.
- **Law.Signoff**: Binary verdict. NO amber. Mandatory GO tiles without `evidenceRefs` = `false-green` => `NO_GO`.
- **Law.Divergence**: Terminal divergence check must use `appPool` -> `sysPool` two-step query. No cross-db joins. Compare `app.runs.workflow_id` with `dbos.workflow_status.workflow_uuid`.

## 🏗️ Components & Seams

### Signoff Board (`/src/server/signoff-api.ts`)

- **PF Strip**: `quick`, `check`, `full`, `deps`, `policy`, `crashdemo`.
- **Proof Strip**: Canonical run proofs (idem, drift, 400, x1, parity).
- **Rollback Triggers**:
  - `trigger-budget`: Scans `app.artifacts` for `VIOLATION` (24h).
  - `trigger-x1-drift`: Scans `app.mock_receipts` (seen_count > 1) + `app.human_interactions` (tuple dupes).
  - `trigger-divergence`: App/DBOS status mismatch via split pools.
  - `trigger-false-green`: Blocked GO claim without evidence.

### Run Console (`/src/components/timeline-live.tsx`)

- **Canonical Start**: `POST /api/run`. Pinned `recipeRef{id,v}`.
- **Lattice UX**: `409` (Conflict) is rendered with diff; `400/404/500` still mostly console-only (Gap T1).
- **HITL x1**: Every reply requires `origin` + `dedupeKey`. Drift => `409`.

### Repro Pack (`/scripts/repro-pack.ts`)

- **Truth Pack**: Collects `app.*` + `dbos.workflow_status` + `dbos.workflow_events`.
- **Triage Oracle**: 1.`/healthz` -> 2.Run API -> 3.App SQL -> 4.DBOS SQL -> 5.Logs.

## 🎓 Step-by-Step Walkthroughs

### W1: The Canonical Happy Path ($W)

1.  **Boot**: `mise run start:worker` + `mise run start:api-shim` (same `DBOS__APPVERSION`).
2.  **Start**: `curl -X POST $BASE/api/run -d '{"recipeRef":{"id":"compile-default","v":"v1"},"formData":{"goal":"handoff-test"}}'` -> Extract `$W`.
3.  **Monitor**: `GET /api/runs/$W` until `waiting_input` or `SUCCESS`.
4.  **Gate**: `GET /api/runs/$W/gates` -> Extract `$G`.
5.  **Reply**: `POST /api/runs/$W/gates/$G/reply -d '{"payload":{"choice":"yes"},"origin":"manual","dedupeKey":"h1"}'`.
6.  **Verify**: `SUCCESS` in UI and `app.runs` SQL.

### W2: Prove Reversibility

1.  **Run**: Execution triggering `ApplyPatchST`.
2.  **Inspect**: `GET /api/runs/$W/steps/ApplyPatchST/patches`.
3.  **SQL**: `SELECT * FROM app.patch_history WHERE run_id=(...)`.
4.  **Verify**: Reversible tuple `(pre_hash, post_hash, diff_hash)` exists.

### W3: Trigger Terminal Divergence

1.  **Mock**: Record a `succeeded` run in `app.runs`.
2.  **Drift**: Manually delete the corresponding row in `dbos.workflow_status` (sys DB).
3.  **Observe**: `/?board=signoff` -> `trigger-divergence` turns RED.

## 🛠️ Maintenance & Ops

- **DB Reset**: `mise run db:sys:reset && mise run db:reset && mise run db:migrate`.
- **Teardown**: DBOS shutdown hangs if tasks are `PENDING`. Law: Cancel active workflows before stop.
- **Adding Policy**: Add script to `scripts/`, then wire into `mise run policy`. Must include self-test.

## 🕳️ Gaps & Debt

- **T32 (Critical)**: `test/e2e/spec11-scenario-matrix.test.ts` is missing. Closure blocked.
- **T17/T19**: Throughput board has unasserted JSON + missing provenance cards.
- **T4/T36**: HITL Inbox deep-linking is brittle; origin enum is duplicated in UI.
- **T6**: Mobile layout hardcodes 2-col desktop widths.
