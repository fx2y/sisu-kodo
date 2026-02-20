# Sisu-Kodo Constitution

Single policy root: global `AGENTS.md` + scoped `.codex/rules/*.md`.  
Abbrev: WF=workflow control, ST=workflow step(IO), SBX=sandbox.

## Authority

1. `AGENTS.md`
2. `.codex/rules/*`
3. nearest spec/contracts/tests

Tie-break: stricter deterministic fail-closed rule wins.

## Compounding Loop

- On each new cycle/iteration, distill `spec-0/00-learnings.jsonl`, current `*-tasks.jsonl`, current `*-tutorial.jsonl`.
- Promote only durable laws (contract/semantics/proof gates), drop one-off story text.
- Encode as terse invariants here; keep scoped deltas in `.codex/rules/*`; delete duplicates.
- If evidence shows drift, update rule first, then code/tests/tasks.

## Priority Kernel

- Decision order: `public contract > determinism/fail-closed > SQL-provable exactly-once > throughput/ergonomics/style`.
- Bans: retry-as-fix, silent fallback, logs-as-proof.
- Truth source: SQL rows (`app.*`, `dbos.workflow_status`), never RAM/log narrative.
- Orchestration truth: `mise` DAG (`quick/check/full`) via explicit `depends`.
- No raw entropy/time outside wrappers: `Math.random|Date.now|new Date|process.hrtime|crypto.randomUUID`.

## Architecture Kernel

- Import DAG only: `config -> {db,workflow,server,oc,sbx,lib}`.
- Env ingress only `src/config.ts`; downstream typed config only.
- Hard split: WF deterministic control only; ST IO only; repo SQL mapping only.
- OC boundary: only `src/oc/**` touches SDK; elsewhere via `OCClientPort`.
- SBX boundary: `RunInSBXPort={provider,run,health}`; default provider `e2b`; alt provider gated/explicit else fail-closed.
- Retryable SBX errors only `{BOOT_FAIL,NET_FAIL,UPLOAD_FAIL,DOWNLOAD_FAIL}`; `CMD_NONZERO|TIMEOUT|OOM` terminal.

## Contract Kernel

- Single Ajv kernel in `src/contracts/**`.
- Boundary chain fixed: `ingress -> db-load -> step-out -> egress`.
- Boundary typing fail-closed: no boundary `as` on request/response/error paths.
- JSON/schema/policy violations => deterministic JSON `400` + zero writes.
- Primary API surface: Next App Router `/api/**`; compat surfaces allowed only with behavior parity.
- Control-plane `/api/ops/wf*` surface is exact-six routes (list/get/steps/cancel/resume/fork), contract-strict.

## Workflow + DB Kernel

- Product run identity: `workflowID=intentId`; steps fixed `CompileST|ApplyPatchST|DecideST|ExecuteST`.
- Duplicate start is idempotent success; never downgrade status.
- Persist step outputs/artifacts before step return.
- Exactly-once is DB law: `marks(run_id,step)` PK + unique dedupe keys + duplicate-prone writes `ON CONFLICT DO NOTHING`.
- Fanout identity: `workflowID=taskKey=SHA256(canonical{intentId,runId,stepId,normalizedReq})`.
- Queue law: parent WF only `intentQ`; child fanout only `sbxQ`; queue class deterministic `compileQ|sbxQ|controlQ|intentQ`.
- Partition law: when enabled, non-blank `queuePartitionKey` mandatory and propagated end-to-end.
- Split topology law: shim enqueue/read only; worker executes WF internals; shared `DBOS__APPVERSION` mandatory.
- History append-only: `run_steps|artifacts|sbx_runs`; projections must declare latest-wins explicitly.
- Status law: no terminal->nonterminal downgrade; only explicit repair transition may reopen path.

## Recovery + Ops Kernel

- Recovery/HITL are first-class deterministic flows.
- HITL events only from `waiting_input`; retry envelope fixed `{accepted,newRunId,fromStep}`.
- Terminal retry exhaustion projects `retries_exceeded` + `nextAction=REPAIR`.
- Cancel/resume/fork semantics are guard-based and fail-closed (`409` on illegal state/step).
- Ops intent artifacts must capture operator context (`actor`,`reason`) for accepted actions.

## Artifact + Telemetry Kernel

- Every step emits >=1 artifact; no domain output => sentinel `kind=none`,`idx=999`.
- Artifact contract: canonical `artifact://...`, SHA-256 (64 hex), durable `artifact_index idx=0`.
- Telemetry is adjunct: seq-ordered chunks + durable `stream_closed`; never used as primary proof.
- Trace-link config fail-closed at ingress (`TRACE_BASE_URL` valid http(s) template).
- Trace/span IDs may be null; never fabricate IDs.

## Proof Floor (release gate)

- Bootstrap once/clone: `MISE_TASK_OUTPUT=prefix mise install`.
- Edit-set gate: `mise run quick`.
- Pre-merge gate: `mise run check`.
- Signoff gate: `mise run full`.
- Repeats/soaks admissible only by force: `mise run -f <task>`.
- Mandatory proofs:
- Crash durability: `mise run -f wf:crashdemo` => `SUCCESS` + marks `s1:1,s2:1`.
- Product flow: `POST /api/intents` -> `POST /api/runs` -> poll `GET /api/runs/:wid` terminal.
- Fail-closed ingress/policy: malformed JSON/schema/policy => deterministic `400` + zero writes.
- SQL exactly-once: duplicates remain zero (`mock_receipts`,`sbx_runs`, step/artifact uniqueness checks).
- Partition signoff: `SBX_QUEUE_PARTITION=true` (demo `false` is non-signoff only).
- Topology parity: shim `/healthz`, enqueue/read split, shared `DBOS__APPVERSION`.
- Task DAG truth proof: `mise tasks deps check`.

## Coding Posture

- Prefer pure functions, total parsers, explicit dataflow.
- Boundary code uses explicit unions/Results; async logic uses explicit state machines.
- Names encode intent (`assert*|parse*|toRow*|fromRow*`), not mechanism.
- Comments only for invariants/tradeoffs (no narration).
- Encode impossible states in types; avoid boolean soup and implicit defaults.
- Every semantic fix ships fail-before/pass-after durable proof in same change.
- Recurring failure must be converted into automation (gate/test/fixture), not tribal memory.

## Runtime Matrix

- Pins: `Node 24`, `postgres:18.2`.
- OC: `OC_MODE=replay|record|live` (default `replay`).
- SBX: `SBX_MODE=mock|live` (default `mock`), `SBX_PROVIDER=e2b|microsandbox` (default `e2b`).
- SBX alt provider gate: `SBX_ALT_PROVIDER_ENABLED=true|false` (default `false`).
- Queue partition: `SBX_QUEUE_PARTITION=true|false` (default `true`).
- Topology parity: `DBOS__APPVERSION=<string>` (default `v1`).

## Current Pins + Quirks

- Runtime SoT: DBOS SDK (`v4.8.8`); custom PG workflow service is legacy canary/harness.
- OpenCode spec pin: `v1.2.6` (2026-02-16); bump explicitly.
- Live signoff mode: strict fail-closed (`OC_STRICT_MODE=1`); permissive mode is non-signoff.
- DBOS quirks: `system_database_url` snake_case only; no `${VAR:-default}` placeholders.
- Decorator runtime requires TS Stage-2 flags: `experimentalDecorators` + `emitDecoratorMetadata`.
- DBOS admin port is isolated from app port.

## Imports

@.codex/rules/10-task-ci.md
@.codex/rules/20-backend-ts.md
@.codex/rules/30-db-workflow.md
@.codex/rules/40-tests-determinism.md
@.codex/rules/50-ui-content.md
