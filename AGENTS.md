# Sisu-Kodo Agent Constitution

Single policy root. Keep exactly one `AGENTS.md`; scoped rules live only in `.codex/rules/*.md`.

## Priority

1. `AGENTS.md` (global law)
2. imported `.codex/rules/*`
3. nearest tests/contracts/spec

Tie-break: choose stricter deterministic/fail-closed behavior.

## Operating Loop (mandatory)

- Bootstrap: `mise install`
- Pins: `Node 24`, `postgres:18.2`, `MISE_TASK_OUTPUT=prefix`
- Every edit: `mise run quick`
- Pre-merge: `mise run check`
- Regression: `mise run full`
- Repeats/soaks only: `mise run -f <task>`

## Non-Negotiables

- Orchestration: `mise` is sole DAG for local+CI+docs; `quick/check/full` must be explicit via `depends`.
- Task metadata: every `run` task has `sources`; expensive tasks have `outputs|outputs.auto`; only always-run exceptions: `db:reset|db:sys:reset|test:e2e`.
- Determinism: fail-closed beats throughput. No retry-as-fix/log-oracle/hidden entropy.
- Entropy/time ban (outside wrappers): `Math.random|Date.now|new Date|process.hrtime|crypto.randomUUID`.
- Config ingress: only `src/config.ts` reads `process.env`.
- Architecture seams: `config -> {db,workflow,server,oc,sbx,lib}` only; no reverse/cross shortcuts.
- Workflow split: WF control-only deterministic; ST owns IO.
- Durable truth: Postgres rows; memory only transient dedupe/scheduling.
- Contracts: single Ajv kernel in `src/contracts`; no local Ajv.
- Boundary safety: no boundary `as` casts at ingress/egress/error; parse+narrow.
- API contract: deterministic JSON; stable fields/status envelopes; invalid JSON/schema => deterministic `400`.
- Identity/timeline contract: `workflowID=intentId`; step IDs fixed `CompileST|ApplyPatchST|DecideST|ExecuteST`.
- Queue policy: pre-enqueue hard-fail; invalid recipe/workload/cap => `400` + zero writes.
- Split topology: API shim enqueues/reads only (no workflow internals); worker executes/imports workflows.
- App-version parity: shim+worker share `DBOS__APPVERSION`.
- OC boundary: only `src/oc/**` may touch SDK; all other layers use `OCClientPort`; session per run (`title=runId`), allowlist at wrapper, `parentID` banned.
- Exactly-once is DB-enforced: singleton run identity, `marks(run_id,step)` PK, duplicate writes `ON CONFLICT DO NOTHING`, `op_key` unique.
- Repair/HITL: deterministic first-class path; events only in `waiting_input`; retry envelope stable `{accepted,newRunId,fromStep}`.
- Artifact integrity: persist real SHA-256 digests (no placeholders).

## Proof Floor (must stay green)

- Crash durability: `PORT=3004 ADMIN_PORT=3006 mise run -f wf:crashdemo` => `marks{s1:1,s2:1}` + terminal `SUCCESS`.
- Product path: `POST /intents` -> `POST /intents/:id/run` -> poll `GET /runs/:id|:workflowID` to terminal deterministic projection.
- Fail-closed API: malformed JSON/schema and queue-cap violations => deterministic `400`; invalid writes = zero rows.
- Topology proof: shim `/healthz` up, enqueue/read works by `runId` + `workflowId`, shared `DBOS__APPVERSION`.
- Recovery proof: deterministic terminal failure projects `retries_exceeded` + `nextAction=REPAIR`; retry/HITL contracts hold.
- Replay oracle: SQL only (`run_steps.output.attempt`, `mock_receipts.seen_count`, `opencode_calls`), never logs.
- Golden proof: `mise run test:e2e`; refresh only `REFRESH_GOLDEN=1` after volatility normalization.
- Ops parity: `mise run check`; forced soaks (`-f wf:intent:chaos:soak`, `-f sandbox:soak`); `mise tasks deps check` remains truthful.

## Coding Posture (ultra-opinionated)

- Prefer pure functions, total parsers, explicit dataflow; avoid implicit state and action-at-a-distance.
- Keep modules narrow and boring; repo layer maps SQL only; orchestration/branching belongs above.
- Names encode intent, not mechanism (`assertRunRequest`, not `validate1`).
- Reject silent fallback defaults in execution paths; explicit error > accidental success.
- Every semantic bugfix lands with durable proof (test/gate/invariant) in same change.
- Every recurring failure mode becomes automation (policy script, negative probe, deterministic fixture).

## Unknown-Iteration Heuristic

When spec is ambiguous or evolving: preserve public contracts + determinism + SQL-oracle evidence first; optimize throughput/ergonomics only after invariants stay machine-provable.

## Current Constraints (state honestly)

- DBOS SDK runtime (v4.8.8) is authoritative SoT; custom PG workflow service is legacy canary/proof harness.
- OpenCode pin in spec is `v1.2.6` (2026-02-16); update explicitly on bump.
- `oc:live:smoke` remains contract stub until real provider endpoint/creds are wired.
- `sbx:live:smoke` remains shell adapter until microVM runner integration exists.
- DBOS 4.x quirks active: `system_database_url` snake_case only; no `${VAR:-default}` placeholders.
- DBOS decorators require TS Stage-2 flags: `experimentalDecorators` + `emitDecoratorMetadata`.
- DBOS admin port (`3002`) is isolated from app port (`3001`).

## Imports

@.codex/rules/10-task-ci.md
@.codex/rules/20-backend-ts.md
@.codex/rules/30-db-workflow.md
@.codex/rules/40-tests-determinism.md
@.codex/rules/50-ui-content.md
