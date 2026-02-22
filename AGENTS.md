# Sisu-Kodo Constitution

Single policy root: `AGENTS.md` + scoped `.codex/rules/*.md`.
Legend: WF=workflow control; ST=workflow step(IO); SBX=sandbox.

## Authority

1. `AGENTS.md`
2. `.codex/rules/*`
3. nearest spec/contracts/tests

Conflict rule: stricter deterministic fail-closed invariant wins.

## Compounding Loop

- Every iteration, distill `spec-0/00-learnings.jsonl`, current `*-tasks.jsonl`, current `*-tutorial.jsonl`.
- Promote only durable laws: contract shape, determinism, x-once keys, topology, proof gates, recurring footguns.
- Drop story/changelog text; encode laws tersely here; keep scoped deltas in `.codex/rules/*`; remove duplicates.
- Drift protocol: update policy first, then tests/tasks, then code.

## Decision Kernel

- Priority: `public contract > determinism/fail-closed > SQL-provable exactly-once > throughput/ergonomics/style`.
- Bans: retry-as-fix, silent fallback, logs-as-proof.
- Truth oracle: SQL (`app.*`, `dbos.workflow_status`, `dbos.workflow_events`), not RAM/log narrative.
- Orchestration truth: `mise` DAG (`quick/check/full`) with explicit `depends`.
- No raw entropy/time outside wrappers: `Math.random|Date.now|new Date|process.hrtime|crypto.randomUUID`.

## Architecture Kernel

- Import DAG only: `config -> {db,workflow,server,oc,sbx,lib}`.
- Env ingress only `src/config.ts`; downstream consumes typed config.
- Hard split: WF deterministic control only; ST IO only; repos SQL mapping only.
- OC boundary: only `src/oc/**` touches SDK; others via `OCClientPort`.
- SBX boundary: `RunInSBXPort={provider,run,health}`; default `e2b`; alt provider requires explicit gate or fail-closed.
- Next App Router `/api/**` is primary surface; manual router/shim must preserve behavior parity.

## Contract Kernel

- Single Ajv kernel: `src/contracts/**`.
- Boundary order fixed: `ingress -> db-load -> step-out -> egress`.
- Boundary typing fail-closed: no boundary `as` on req/resp/error paths.
- Malformed JSON/schema/policy => deterministic JSON `400` + zero writes.
- Error lattice deterministic: `400` validation/json, `404` missing target, `409` state/identity mismatch, `500` only unexpected faults.
- Control plane `/api/ops/wf*` is exact-six routes: list/get/steps/cancel/resume/fork.

## Workflow + DB Kernel

- Product run identity: `workflowID=intentId`; step set fixed `CompileST|ApplyPatchST|DecideST|ExecuteST`.
- Duplicate start => idempotent success; never downgrade status.
- Persist step outputs/artifacts before step return.
- Exactly-once is DB law: PK/unique keys + duplicate-prone writes `ON CONFLICT DO NOTHING`.
- History append-only: `run_steps|artifacts|sbx_runs`; projections must declare latest-wins.
- Status monotonic merge: no terminal->nonterminal downgrade; equal-rank keeps durable; reopen only explicit repair transition.
- Fanout identity: `workflowID=taskKey=SHA256(canonical{intentId,runId,stepId,normalizedReq})`.
- Queue law: parent WF only `intentQ`; child fanout only `sbxQ`; class deterministic `compileQ|sbxQ|controlQ|intentQ`.
- Partition law: if enabled, non-blank `queuePartitionKey` is mandatory and propagated end-to-end.
- Split topology law: shim enqueue/read only; worker executes internals; shared `DBOS__APPVERSION` mandatory.

## HITL + Event Kernel

- ABI freeze: keys `ui:<g>|ui:<g>:result|decision:<g>|ui:<g>:audit`; topics `human:<g>|sys:<k>`.
- `awaitHuman` path is canonical; no decision bypass/pre-approval short-circuit.
- HITL events accepted only from `waiting_input` lanes.
- Reply ingress must validate `gateKey/topic` match and resolve `(run,gate)` before any write/send.
- Interaction ledger is x-once tuple: `(workflow_id,gate_key,topic,dedupe_key)`; dedupe mismatch (same key, diff payload/topic) => `409`.
- Dedupe law: never finalize idempotency ledger before effect can be observed/confirmed.
- `origin` is mandatory at contract+SQL boundaries; allowed set is explicit and closed.
- Decision/audit payloads are schema-strict enums; no ad-hoc event shapes.
- Gate GET supports bounded long-poll only (`timeoutS` validated range).
- Escalation is separate deterministic WF: `workflowID=esc:<wid>:<gate>`.
- Streams are adjunct, workflow-scoped by key, seq-ordered, with explicit terminal close.

## Recovery + Ops Kernel

- Retry exhaustion projects `status=retries_exceeded` + `nextAction=REPAIR`.
- Cancel/resume/fork are guard-based and fail-closed (`409` on illegal state/step).
- Accepted ops action must append OPS artifact including `actor` + `reason`.
- Ops listings/projections must be deterministic and bounded (newest-first for limit windows).

## Proof Floor

- Bootstrap once/clone: `MISE_TASK_OUTPUT=prefix mise install`.
- Edit-set gate: `mise run quick`.
- Pre-merge gate: `mise run check`.
- Signoff gate: `mise run full`.
- Repeats/soaks admissible only by force: `mise run -f <task>`.
- Mandatory proofs:
- Happy path: `POST /api/intents -> POST /api/runs -> GET /api/runs/:wid` terminal.
- Crash durability: `mise run -f wf:crashdemo` => `SUCCESS` + marks `s1:1,s2:1`.
- Fail-closed ingress/policy: malformed JSON/schema/policy => `400` + zero writes.
- SQL x-once: duplicates stay zero (`run_steps`,`artifacts`,`human_interactions`,`decision keys`).
- Partition signoff: `SBX_QUEUE_PARTITION=true` (demo `false` is non-signoff).
- Topology parity: shim `/healthz`, enqueue/read split, shared `DBOS__APPVERSION`.
- Task graph truth: `mise tasks deps check`.

## Coding Posture

- Prefer pure functions, total parsers, explicit dataflow/state machines.
- Boundary code returns explicit unions/Results; avoid throw-driven control flow.
- Names encode intent (`assert*|parse*|toRow*|fromRow*`), not mechanism.
- Encode impossible states in types; avoid boolean soup/implicit defaults.
- Comments only for invariants/tradeoffs.
- Every semantic fix must ship fail-before/pass-after durable proof in same change.
- Recurring failure must become automation (gate/test/fixture), never tribal memory.

## Runtime Matrix

- Pins: `Node 24`, `postgres:18.2`.
- OC: `OC_MODE=replay|record|live` (default `replay`).
- SBX: `SBX_MODE=mock|live` (default `mock`), `SBX_PROVIDER=e2b|microsandbox` (default `e2b`).
- SBX alt provider gate: `SBX_ALT_PROVIDER_ENABLED=true|false` (default `false`).
- Queue partition: `SBX_QUEUE_PARTITION=true|false` (default `true`).
- Topology parity: `DBOS__APPVERSION=<string>` (default `v1`).

## Current Pins + Quirks

- Runtime SoT: DBOS SDK `v4.9.11`; legacy custom PG workflow service is harness/canary only.
- OpenCode spec pin: `v1.2.6` (2026-02-16); bump explicitly.
- Live signoff mode: strict fail-closed (`OC_STRICT_MODE=1`); permissive mode non-signoff.
- DBOS quirks: `system_database_url` snake_case only; no `${VAR:-default}` placeholders.
- Decorator runtime requires `experimentalDecorators` + `emitDecoratorMetadata`.
- DBOS admin port is isolated from app port.

## Imports

@.codex/rules/10-task-ci.md
@.codex/rules/20-backend-ts.md
@.codex/rules/30-db-workflow.md
@.codex/rules/40-tests-determinism.md
@.codex/rules/50-ui-content.md
