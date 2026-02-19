# Sisu-Kodo Agent Constitution

Single policy root: one `AGENTS.md`; scoped policy only in `.codex/rules/*.md`.
Legend: WF=workflow control, ST=workflow step (IO), SBX=sandbox.

## Authority

1. `AGENTS.md`
2. imported `.codex/rules/*`
3. nearest spec/contracts/tests

Tie-break: stricter deterministic fail-closed rule wins.

## Mandatory Loop

- Bootstrap: `mise install`
- Pins: `Node 24`, `postgres:18.2`, `MISE_TASK_OUTPUT=prefix`
- Every edit: `mise run quick`
- Pre-merge: `mise run check`
- Regression: `mise run full`
- Repeats/soaks only: `mise run -f <task>`

## Core Law

- Determinism > throughput: fail-closed by default; ban retry-as-fix, logs-as-proof, silent fallback.
- Entropy/time banned outside wrappers: `Math.random|Date.now|new Date|process.hrtime|crypto.randomUUID`.
- Orchestration truth: `mise` only; `quick/check/full` explicit by `depends`.
- Config/arch seams: env only in `src/config.ts`; imports only `config -> {db,workflow,server,oc,sbx,lib}`.
- Split of concern: WF=deterministic control, ST=IO, repo=SQL mapping only.
- Contract kernel: one Ajv in `src/contracts`; no boundary `as`; parse/assert/narrow at ingress->db-load->step-out->egress.
- API contract: deterministic JSON envelope; malformed JSON/schema/policy violations => deterministic `400` + zero writes.
- Stable workflow API: `workflowID=intentId`; steps fixed `CompileST|ApplyPatchST|DecideST|ExecuteST`.
- Queue hard laws: pre-enqueue validation; parent queue=`intentQ`; child fanout queue=`sbxQ`; never parent on `sbxQ`.
- Partition law: partitioned queues require non-blank `queuePartitionKey` and full propagation.
- Split topology: shim enqueue/read only; worker imports/executes WF internals; both share `DBOS__APPVERSION`.
- Exactly-once is DB law: unique dedupe keys, `marks(run_id,step)` PK, duplicate writes guarded by `ON CONFLICT DO NOTHING`.
- Attempt history is append-only (`run_steps|artifacts|sbx_runs`); projections must explicitly choose latest.
- Truth source: Postgres rows + SQL replay oracle (`app.*`,`dbos.workflow_status`); memory/logs are non-authoritative.
- Recovery/HITL: deterministic first-class path; events only in `waiting_input`; retry envelope fixed `{accepted,newRunId,fromStep}`.
- Artifact/telemetry: real SHA-256 (64-hex), canonical `artifact://...`, `artifact_index` at `idx=0`, stream terminal marker durable.
- Boundary adapters: only `src/oc/**` touches OC SDK (`OCClientPort` elsewhere), SBX prod default=`e2b`, alt provider explicit-flag only, unsupported paths fail closed.

## Proof Floor (must stay green)

- Crash durability: `PORT=3004 ADMIN_PORT=3006 mise run -f wf:crashdemo` => `SUCCESS` + marks `s1:1,s2:1`.
- Product flow: `POST /intents` -> `POST /intents/:id/run` -> poll `GET /runs/:id|:workflowID` terminal projection.
- Fail-closed ingress/policy: malformed JSON/schema/cap violations => deterministic `400` + zero writes.
- Topology parity: shim `/healthz`, enqueue/read by `runId` + `workflowId`, shared `DBOS__APPVERSION`.
- Recovery path: terminal deterministic failure projects `retries_exceeded` + `nextAction=REPAIR`.
- Exactly-once proof: fanout dedupe duplicates remain zero in SQL oracle.
- Golden/release: `mise run test:e2e` (refresh only `REFRESH_GOLDEN=1`), then `quick && check && full` + forced soaks.
- DAG audit: `mise tasks deps check` truthful.

## Coding Posture

- Pure functions, total parsers, explicit dataflow.
- Names encode intent (`assert*|parse*|toRow*|fromRow*`), never mechanism.
- Every semantic fix ships durable proof in same change.
- Recurring failures become automation (gate/test/fixture).

## Unknown-Iteration Heuristic

When requirements drift: preserve public contract + determinism + SQL-oracle provability first; optimize throughput/ergonomics only after proofs stay green.

## Ops Matrix

- OC: `OC_MODE=replay|record|live` (default `replay`)
- SBX: `SBX_MODE=mock|live` (default `mock`), `SBX_PROVIDER=e2b|microsandbox` (default `e2b`)
- SBX flag: `SBX_ALT_PROVIDER_ENABLED=true|false` (default `false`)
- Queue partition: `SBX_QUEUE_PARTITION=true|false` (default `true`)
- Topology parity: `DBOS__APPVERSION=<string>` (default `v1`)

## Current Constraints

- Runtime SoT is DBOS SDK (`v4.8.8`); custom PG workflow service is legacy canary/harness.
- OpenCode pin in spec: `v1.2.6` (2026-02-16); bump explicitly.
- Live signoff is strict fail-closed (`OC_STRICT_MODE=1`); permissive mode is non-signoff only.
- DBOS 4.x quirks: `system_database_url` snake_case only; no `${VAR:-default}` placeholders.
- DBOS decorators require TS Stage-2 flags: `experimentalDecorators` + `emitDecoratorMetadata`.
- DBOS admin port (`3002`) is isolated from app port (`3001`).

## Imports

@.codex/rules/10-task-ci.md
@.codex/rules/20-backend-ts.md
@.codex/rules/30-db-workflow.md
@.codex/rules/40-tests-determinism.md
@.codex/rules/50-ui-content.md
