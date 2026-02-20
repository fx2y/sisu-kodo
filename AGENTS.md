# Sisu-Kodo Constitution

Single policy root: `AGENTS.md` (global) + `.codex/rules/*.md` (scoped).  
Legend: WF=workflow control, ST=workflow step (IO), SBX=sandbox.

## Authority

1. `AGENTS.md`
2. imported `.codex/rules/*`
3. nearest spec/contracts/tests

Tie-break: stricter deterministic fail-closed rule wins.

## Mandatory Loop

- Bootstrap once/clone: `MISE_TASK_OUTPUT=prefix mise install`
- Pins: `Node 24`, `postgres:18.2`
- Every edit-set: `mise run quick`
- Pre-merge: `mise run check`
- Regression/signoff: `mise run full`
- Repeats/soaks only by force: `mise run -f <task>`

## Kernel Priorities

- Unknown-iteration order: `public contract > determinism/fail-closed > SQL-oracle provability/exactly-once > throughput/ergonomics/style`.
- Ban: retry-as-fix, logs-as-proof, silent fallback.
- Ban raw entropy/time outside wrappers: `Math.random|Date.now|new Date|process.hrtime|crypto.randomUUID`.
- Orchestration truth: `mise` DAG only (`quick/check/full` via explicit `depends`).

## Architecture + Contracts

- Import DAG only: `config -> {db,workflow,server,oc,sbx,lib}`.
- Env ingress only `src/config.ts`; downstream typed config only.
- Split hard: WF=deterministic ctl-only, ST=IO-only, repo=SQL mapping-only.
- Single Ajv kernel in `src/contracts`; boundary lattice `ingress -> db-load -> step-out -> egress`.
- Boundary typing fail-closed: no boundary `as` on ingress/egress/error paths.
- API law: deterministic JSON envelope only; malformed JSON/schema/policy => deterministic `400` + zero writes.
- Primary HTTP surface: Next App Router `/api/**`; compatibility endpoints allowed only with behavior parity + fail-closed semantics.

## Workflow + Queue + DB

- Workflow API fixed: `workflowID=intentId`; steps fixed `CompileST|ApplyPatchST|DecideST|ExecuteST`.
- Start conflict path is idempotent success; never downgrade status on duplicate start.
- Step outputs persist before return.
- Queue law: parent intent WF on `intentQ`; child fanout on `sbxQ`; never parent on `sbxQ`.
- Queue class derivation deterministic: `compileQ|sbxQ|controlQ|intentQ`.
- Partition law: when enabled, non-blank `queuePartitionKey` mandatory + propagated end-to-end.
- Split topology: shim enqueue/read only; worker imports/executes WF internals; shared `DBOS__APPVERSION` required.
- Exactly-once is DB law: `marks(run_id,step)` PK + DB-unique dedupe keys + duplicate-prone writes via `ON CONFLICT DO NOTHING`.
- Fanout identity: `workflowID=taskKey`, `taskKey=SHA256(canonical{intentId,runId,stepId,normalizedReq})`.
- Attempt history append-only: `run_steps|artifacts|sbx_runs`; projections must explicitly encode latest-wins.
- Truth source: SQL rows (`app.*`,`dbos.workflow_status`), never memory/log narratives.

## Recovery + Artifacts + Telemetry

- Recovery/HITL are deterministic first-class flows.
- HITL events only from `waiting_input`; retry envelope fixed `{accepted,newRunId,fromStep}`.
- Terminal retries project `retries_exceeded` + `nextAction=REPAIR`.
- Artifact contract: canonical `artifact://...`, real SHA-256 (64 hex), durable `artifact_index` at `idx=0`.
- Every step emits >=1 artifact; no domain output => sentinel `kind=none`,`idx=999`.
- Telemetry is adjunct (not truth): seq-ordered chunks + durable terminal `stream_closed` marker.
- Trace links fail-closed at config ingress (`TRACE_BASE_URL` valid http(s) template); trace/span IDs may be null, never fabricated.

## Adapter Boundaries

- Only `src/oc/**` may touch OC SDK (`OCClientPort` elsewhere).
- SBX runtime behind `RunInSBXPort={provider,run,health}`.
- SBX prod default `e2b`; alt provider only with explicit flag; unsupported paths fail closed.
- Retryable SBX errors only `{BOOT_FAIL,NET_FAIL,UPLOAD_FAIL,DOWNLOAD_FAIL}`; `CMD_NONZERO|TIMEOUT|OOM` are terminal.

## Proof Floor (must stay green)

- Crash durability: `PORT=3004 ADMIN_PORT=3006 mise run -f wf:crashdemo` => `SUCCESS` + marks `s1:1,s2:1`.
- Strict product flow: `POST /api/intents` -> `POST /api/runs` -> poll `GET /api/runs/:wid` to terminal.
- Fail-closed ingress/policy: malformed JSON/schema/policy/caps => deterministic `400` + zero writes.
- Signoff partition mode: `SBX_QUEUE_PARTITION=true`; demo mode (`false`) is non-signoff only.
- Exactly-once SQL proof: duplicate side-effects remain zero (`mock_receipts`,`sbx_runs`).
- Topology parity proof: shim `/healthz`, enqueue/read split, shared `DBOS__APPVERSION`.
- Release gate: `quick && check && full` + forced soaks + e2e + truthful `mise tasks deps check`.

## Coding Posture

- Prefer pure functions, total parsers, explicit dataflow.
- Prefer unions/Results at boundaries + explicit async state machines.
- Names encode intent (`assert*|parse*|toRow*|fromRow*`), not mechanism.
- Comments document invariants/tradeoffs only.
- Every semantic fix ships fail-before/pass-after durable proof in same change.
- Recurring failures must become automation (gate/test/fixture).

## Ops Matrix

- OC: `OC_MODE=replay|record|live` (default `replay`)
- SBX: `SBX_MODE=mock|live` (default `mock`), `SBX_PROVIDER=e2b|microsandbox` (default `e2b`)
- SBX alt-provider flag: `SBX_ALT_PROVIDER_ENABLED=true|false` (default `false`)
- Queue partition: `SBX_QUEUE_PARTITION=true|false` (default `true`)
- Topology parity: `DBOS__APPVERSION=<string>` (default `v1`)

## Current Constraints

- Runtime SoT: DBOS SDK (`v4.8.8`); custom PG workflow service = legacy canary/harness.
- OpenCode spec pin: `v1.2.6` (2026-02-16); bump explicitly.
- Live signoff mode: strict fail-closed (`OC_STRICT_MODE=1`); permissive mode non-signoff.
- DBOS 4.x quirks: `system_database_url` snake_case only; no `${VAR:-default}` placeholders.
- DBOS decorators require TS Stage-2 flags: `experimentalDecorators` + `emitDecoratorMetadata`.
- DBOS admin port is isolated from app port.

## Imports

@.codex/rules/10-task-ci.md
@.codex/rules/20-backend-ts.md
@.codex/rules/30-db-workflow.md
@.codex/rules/40-tests-determinism.md
@.codex/rules/50-ui-content.md
