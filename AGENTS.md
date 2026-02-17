# Sisu-Kodo Agent Constitution

Single repo policy root. Keep exactly one `AGENTS.md` (this file). Put scoped rules only in `.codex/rules/*.md`. No nested agent files.

## Precedence

1. This file's hard invariants.
2. Imported scoped rules.
3. Nearest tests/contracts.

Tie-breaker: choose stricter deterministic behavior.

## Operating Loop (mandatory)

- Toolchain/bootstrap: `mise install`; runtime pin `Node 24`; DB pin `postgres:18.2`.
- Inner loop (every edit): `mise run quick`.
- Pre-merge: `mise run check`.
- Regression/nightly: `mise run full`.
- Repeats/soak: always bypass cache via `mise run -f <task>`.

## Hard Invariants

- `mise` is the only control plane (local+CI+docs). No bespoke npm/shell DAGs.
- Task graph must stay explicit (`check=quick+integration+wf`); no hidden orchestration.
- Any task with `run` MUST define `sources`; expensive tasks MUST define `outputs|outputs.auto`.
- Reset tasks (`db:reset`, `db:sys:reset`) MUST NOT be cached via `outputs`.
- `MISE_TASK_OUTPUT=prefix` only.
- Determinism is fail-closed: ban uncontrolled net/time/random/ports and ban retry-as-fix.
- Raw entropy/time APIs banned outside wrappers: `Math.random|Date.now|new Date|process.hrtime|crypto.randomUUID`.
- Config is centralized in `src/config.ts`; no `process.env` reads elsewhere.
- Architecture seams are strict: `config|db|workflow|server|oc|sbx|lib`; no cross-layer shortcuts.
- Durable truth is Postgres only; in-memory state is transient dedupe/scheduling only.
- Contracts use central Ajv kernel (`src/contracts`); no local Ajv instances.
- Boundary safety: no raw `as` casts at ingress/egress/error paths; use narrowing helpers.
- HTTP/API surface is JSON-only and deterministic (stable fields, explicit status paths).
- Workflow correctness is DB-proven, not log-scraped: `workflow_runs` singleton, `marks(run_id,step)` PK, duplicate-safe writes via `ON CONFLICT DO NOTHING`, crash invariant `s1=1,s2=1`.

## Proof Set (minimum credible evidence)

- Durability: `PORT=3004 mise run -f wf:crashdemo`; DB must show `marks={s1:1,s2:1}` + terminal `SUCCESS`.
- Product flow: start server, `POST /intents`, `POST /intents/:id/run`, poll `GET /runs/:id` until `succeeded`.
- Fail-closed API: invalid JSON/schema => deterministic `400`; invalid payloads must not write rows.
- Deterministic projection: `mise run test:e2e` + golden checks.
- Ops parity: `mise run check`, forced soak reruns, `mise tasks deps check`.

## Compounding Rule (non-optional)

- Every behavior change or bugfix MUST land at least one durable artifact: regression test, invariant/rule, or gate.
- Every recurring failure mode MUST be encoded as automation: task gate, lint/policy script, or test.
- Any `mise` DAG/task semantics change MUST update `mise.toml` + matching `.codex/rules/*` in same PR.
- Semantics changed without tests/invariants => PR invalid.

## Current Constraints (state honestly)

- DBOS SDK runtime (v4.8.8) is authoritative source-of-truth; custom PG-backed workflow service retained as legacy proof/canary only.
- `oc:live:smoke` is contract-stub until real provider endpoint/creds are wired.
- `sbx:live:smoke` is shell adapter until microVM runner integration exists.
- DBOS 4.x config quirks are active: snake_case `system_database_url`; no `${VAR:-default}` placeholders.
- DBOS decorators currently require TS Stage-2 flags: `experimentalDecorators` + `emitDecoratorMetadata`.
- DBOS admin port is isolated (`3002`) from app port (`3001`).

## Imports

@.codex/rules/10-task-ci.md
@.codex/rules/20-backend-ts.md
@.codex/rules/30-db-workflow.md
@.codex/rules/40-tests-determinism.md
@.codex/rules/50-ui-content.md
