# Sisu-Kodo Agent Constitution

Single policy root. Keep exactly one `AGENTS.md`. Scoped rules live only in `.codex/rules/*.md`.

## Precedence

1. This file (global invariants).
2. Imported scoped rules.
3. Nearest tests/contracts/spec.

Tie-break: choose stricter deterministic behavior.

## Operating Loop (mandatory)

- Bootstrap: `mise install`.
- Pins: `Node 24`, `postgres:18.2`, `MISE_TASK_OUTPUT=prefix`.
- Every edit: `mise run quick`.
- Pre-merge: `mise run check`.
- Regression: `mise run full`.
- Repeats/soaks: `mise run -f <task>` only.

## Hard Invariants

- `mise` is sole control plane (local+CI+docs). No bespoke DAGs.
- DAG must stay explicit (`quick`, `check`, `full` composition visible via `depends`).
- `run` tasks require `sources`; expensive tasks require `outputs|outputs.auto`; exact always-run exceptions only: `db:reset|db:sys:reset|test:e2e`.
- Global deterministic scheduling beats hopeful parallelism: serialize conflict lanes; if contention appears, enforce `[settings].jobs=1`.
- Determinism is fail-closed: no retry-as-fix, no log-oracle, no hidden entropy.
- Ban raw entropy/time outside wrappers: `Math.random|Date.now|new Date|process.hrtime|crypto.randomUUID`.
- Config ingress is single-point: only `src/config.ts` may read `process.env`.
- Architecture seams are strict: `config -> {db,workflow,server,oc,sbx,lib}`; no reverse/cross-layer shortcuts.
- Durable truth is Postgres rows; memory is transient dedupe/scheduling only.
- Contracts use central Ajv kernel (`src/contracts`); no local Ajv instances.
- Boundary safety: no raw boundary `as` casts at ingress/egress/error paths; parse+narrow explicitly.
- API surface is deterministic JSON-only: stable fields, explicit status/error paths, deterministic `400` on JSON/schema failures.
- Workflow identity and timeline are stable contracts: `workflowID=intentId`; step IDs are fixed (`CompileST|ApplyPatchST|DecideST|ExecuteST`).
- Split topology contract: API shim enqueues/reads only; worker executes workflows; shim imports no workflow internals.
- Queue policy is pre-enqueue hard-fail: invalid recipe/workload/cap => `400` and zero writes.
- Exactly-once proof is DB-enforced: singleton `workflow_runs`; `marks(run_id,step)` PK; duplicate writes use `ON CONFLICT DO NOTHING`.
- Repair/HITL are first-class deterministic paths: event ingress allowed only in `waiting_input`; retry returns stable envelope `{accepted,newRunId,fromStep}`.

## Proof Set (minimum credible evidence)

- Crash durability: `PORT=3004 ADMIN_PORT=3006 mise run -f wf:crashdemo` => DB proves `marks={s1:1,s2:1}` + terminal `SUCCESS`.
- Product flow: `POST /intents`, `POST /intents/:id/run`, poll `GET /runs/:id|:workflowID` until terminal deterministic projection.
- Fail-closed API: invalid JSON/schema and queue-cap violations return deterministic `400`; invalid payloads write zero rows.
- Topology split: shim+worker share `DBOS__APPVERSION`; shim `/healthz` up; run enqueue/read works by both `runId` and `workflowId`.
- Recovery correctness: terminal deterministic failure projects `retries_exceeded` + `nextAction=REPAIR`; retry/event contracts hold.
- Replay safety oracle is SQL, never logs: `run_steps.output.attempt`, `mock_receipts.seen_count`, `opencode_calls` envelopes.
- Deterministic projection evidence: `mise run test:e2e` + golden checks (`REFRESH_GOLDEN=1` only).
- Ops parity: `mise run check`; forced soaks (`-f wf:intent:chaos:soak`, `-f sandbox:soak`); `mise tasks deps check` truthful.

## Compounding Rule (non-optional)

- Every behavior change/bugfix must land durable proof: regression test, invariant, or gate.
- Every recurring failure mode must become automation: task gate, policy script, or test.
- Any `mise` DAG semantics change must update `mise.toml` + matching `.codex/rules/*` in same PR.
- Policy must self-verify where possible (negative probes; anti-false-green fixtures).
- Semantic change without proof artifact => PR invalid.

## Current Constraints (state honestly)

- DBOS SDK runtime (v4.8.8) is authoritative SoT; custom PG workflow service is legacy canary/proof harness.
- `oc:live:smoke` remains contract stub until real provider endpoint/creds are wired.
- `sbx:live:smoke` remains shell adapter until microVM runner integration exists.
- DBOS 4.x quirks active: `system_database_url` snake_case only; no `${VAR:-default}` placeholders.
- DBOS decorators currently require TS Stage-2 flags: `experimentalDecorators` + `emitDecoratorMetadata`.
- DBOS admin port (`3002`) is isolated from app port (`3001`).

## Imports

@.codex/rules/10-task-ci.md
@.codex/rules/20-backend-ts.md
@.codex/rules/30-db-workflow.md
@.codex/rules/40-tests-determinism.md
@.codex/rules/50-ui-content.md
