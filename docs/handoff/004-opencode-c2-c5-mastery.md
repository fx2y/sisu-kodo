# OpenCode Mastery (C2-C5) Handoff

Expert-grade procedural guide for project-kodo OpenCode (OC) integration. Cycle 5 closure reached.

## 0. Core Axioms

- **WF=Deterministic Control:** No IO, no entropy, no direct OC. Only state machine logic.
- **ST=IO Seams:** All OC side-effects, ledgering, and artifacts live here.
- **Identity:** `workflowID == intentId`. Step IDs are IMMUTABLE: `CompileST|ApplyPatchST|DecideST|ExecuteST`.
- **Durable Truth:** Postgres is the only oracle. `op_key` uniqueness enforces exactly-once provider calls.
- **Fail-Closed:** Invalid schema/contract => 400/Terminal Failure. No `as` casts. No unsafe fallbacks.

## 1. The OC Seam (`src/oc/wrapper.ts`)

Single ingress for all OC calls.

### Key Features:

- **Ledger-v2:** Every call persisted to `app.opencode_calls` with `duration_ms`, `usage`, `request`, `response`.
- **Exactly-Once:** `op_key` = `hash(runId, stepId, attempt, prompt, schema)`. DB-unique constraint prevents double-billing.
- **Cache:** L1 (Memory Map) + L2 (SQL `op_key` lookup).
- **Tool Allowlist:** Agent-based (`plan` vs `build`) enforcement in wrapper. Deny-by-default.
- **Stall Detector:** Kills calls exceeding `OC_TIMEOUT_MS`.

### Code Pattern:

```typescript
const output = await oc.promptStructured(sessionId, prompt, schema, {
  runId,
  stepId,
  attempt,
  agent: "plan"
});
```

## 2. Step Mastery (`src/workflow/steps/`)

Steps are the only place where `OCWrapper` is used.

### `CompileST` (The Compiler)

- **Input:** User Intent.
- **Output:** `PlanOutput` schema (Design + Files + Risks + Tests).
- **Artifacts:** `plan.json` (kind=plan_card) + `diagnostic.json` (on failure).
- **Strictness:** If OC fails to return valid JSON after N retries (within step), step fails terminal.

### `DecideST` (The Router)

- **Input:** Plan + Approval.
- **Action:** Selects next tool/command. Asserts `BuildOutput` schema.

## 3. Plan/Build Split (Approval Gate)

Cycle 4 implementation of RFC-000 security boundary.

### The Gate:

1. `CompileST` finishes -> WF transitions to `waiting_input`.
2. UI/User calls `POST /runs/{id}/approve-plan`.
3. `PlanApprovalRepo` persists row.
4. WF resumes -> `ApplyPatchST` / `DecideST` check for approval row.
5. **Invariant:** No code modification happens before `approved_at` timestamp.

## 4. Hardening & Determinism

- **RNG:** `src/lib/rng.ts` uses `RANDOM_SEED` env for global determinism.
- **Time:** No `Date.now()`. Use `nowMs()` from `src/lib/time.ts` (mockable).
- **Integrity:** All artifacts have `sha256` hex digests. Verified via `src/lib/hash.ts`.
- **Child-Session Ban:** `assertNoChildSession` prevents illegal OC nesting.

## 5. Triage & Operability

Oracles are SQL-first. Logs are secondary.

### Check Run Status:

```sql
SELECT status, last_step, retry_count, next_action FROM app.runs WHERE intent_id = '...';
```

### Check OC Ledger:

```sql
SELECT step_id, agent, duration_ms, (response->'usage'->>'total_tokens')::int as tokens
FROM app.opencode_calls WHERE run_id = '...';
```

### Reset System (Tests):

```bash
mise run db:sys:reset # Clears DBOS internal state + recovery loops
```

## 6. Walkthrough: E2E Demo

1. **Up:** `mise run oc:daemon:up` (Mode=live).
2. **Start:** `mise run start:worker` + `mise run start:api-shim`.
3. **Intent:** `POST /intents` -> `{intentId}`.
4. **Run:** `POST /intents/{id}/run` -> `{runId}`.
5. **Wait:** Status becomes `waiting_input`.
6. **Approve:** `POST /runs/{runId}/approve-plan` -> `accepted: true`.
7. **Done:** Status becomes `succeeded`.

## 7. Adding a New Policy Gate

1. Create script `scripts/policy-my-new-gate.sh`.
2. Add to `mise.toml` under `[tasks.check]`.
3. Use `fixtures/` for known-bad/known-good regression testing.
4. Ensure it fails-closed in CI.

## 9. The Contrarian's Triage

- **Worker Hang?** Check `oc:daemon:health`. 90% it's a dead daemon or a port collision (4096).
- **Run Stuck `queued`?** Check `DBOS__APPVERSION`. Shim/Worker mismatch is a silent killer.
- **Double-Bill?** Impossible via `op_key`. If you see two rows for one `op_key`, the DB constraint is broken. Check `009_op_key_unique.sql`.
- **Nondeterminism?** Check `randomSeed` in `src/lib/rng.ts`. If it's not set via `RANDOM_SEED`, boot is random.
- **Stale State?** `db:sys:reset` is the nuclear option for `test:e2e` failures. Recovery loops in DBOS system DB are sticky.
