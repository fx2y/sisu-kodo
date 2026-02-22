# Sisu-Kodo Constitution

Single policy root: `AGENTS.md` + scoped `.codex/rules/*.md`.
Legend: `WF` deterministic workflow control, `ST` IO step, `SBX` sandbox execution.

## Authority

1. `AGENTS.md`
2. `.codex/rules/*`
3. nearest spec/contracts/tests

Conflict resolver: stricter deterministic fail-closed invariant wins.

## Compounding Loop

- Per iteration distill: `spec-0/00-learnings.jsonl`, current `*-tasks.jsonl`, current `*-tutorial.jsonl`.
- Promote only durable laws: contract ABI, determinism, x-once keys, topology, proofs, recurring footguns.
- Strip narrative/changelog text; keep terse invariants here; keep path deltas in `.codex/rules/*`; dedupe aggressively.
- Drift order: policy -> tests/tasks -> code.

## Decision Kernel

- Priority: `public-contract > determinism/fail-closed > SQL-provable x-once > throughput/ergonomics/style`.
- Bans: retry-as-fix, silent fallback, logs-as-proof, grep-only policy gates, clock/random identity.
- Oracle order: `app.*` SQL -> `dbos.workflow_status/events` -> API JSON; logs are narrative only.
- Orchestration truth: `mise` DAG (`quick < check < full`) with explicit `depends`.

## Architecture Kernel

- Import DAG only: `config -> {db,workflow,server,oc,sbx,lib}`; no reverse/cross leaks.
- Env ingress only `src/config.ts`; downstream reads typed config only.
- Hard seams: `WF` control only, `ST` IO only, repos SQL mapping only.
- OC boundary: only `src/oc/**` touches SDK; others via `OCClientPort`.
- SBX boundary: `RunInSBXPort={provider,run,health}`; default `e2b`; alt provider requires explicit gate else fail-closed.
- API surface: Next App Router `/api/**` is primary; shim/manual routes must preserve contract+error parity.

## Contract Kernel

- One Ajv kernel in `src/contracts/**`; adapter flow fixed: `parse/assert -> service -> repo -> asserted egress`.
- Boundary order fixed: `ingress -> db-load -> step-out -> egress`.
- Boundary typing fail-closed: no boundary `as` on req/resp/error paths.
- Deterministic lattice only: `400` malformed/validation/policy, `404` missing target, `409` state/identity drift, `500` unexpected.
- Malformed JSON/schema/policy always yields deterministic JSON `400` + zero writes.
- `/api/ops/wf*` is exact-six: `list|get|steps|cancel|resume|fork`.

## Recipe + Identity Kernel

- RecipeSpec ABI is strict (`additionalProperties:false` at all boundaries); unknown keys => `400`.
- Recipe storage is append-only in `app.recipe_versions`; mutable pointer only `app.recipes.active_v`.
- Recipe status machine fixed: `draft -> candidate -> stable`; stable version immutable; repair via new version only.
- Canonical content address at repo boundary: `sha256(canonicalStringify(json))`.
- Product run identity: `intentHash=sha256(canon(intent))`, `intentId=ih_<hash>`, `workflowID=intentId`.
- `/api/run` is canonical product ingress; `/api/runs` is legacy adapter.
- Duplicate start is idempotent success; divergence on hash/ref/payload is conflict.

## Workflow + DB Kernel

- Stable step IDs fixed: `CompileST|ApplyPatchST|DecideST|ExecuteST`.
- Step outputs/artifacts persist before step return.
- Exactly-once is DB law: PK/unique keys + duplicate-prone writes `ON CONFLICT DO NOTHING` + semantic load/compare.
- History append-only: `run_steps|artifacts|sbx_runs|human_interactions`; projections must declare latest-wins.
- Status merge monotonic: no terminal->nonterminal downgrade; reopen only explicit repair transition.
- Fanout identity: `workflowID=taskKey=SHA256(canonical{intentId,runId,stepId,normalizedReq})`.
- Queue law: parent WF only `intentQ`; fanout child only `sbxQ`; class deterministic `compileQ|sbxQ|controlQ|intentQ`.
- Partition law: when enabled, nonblank `queuePartitionKey` is mandatory and propagated end-to-end.
- Split topology law: shim enqueue/read only; worker executes internals; shared `DBOS__APPVERSION` mandatory.
- No raw entropy/time in deterministic paths: `Math.random|Date.now|new Date|process.hrtime|crypto.randomUUID`; WF time via DBOS clock seam.

## ApplyPatch + Reversibility Kernel

- `ApplyPatchST` is deterministic output only (no wall-clock fields in replay-compared payloads).
- Patch target scope fail-closed to workspace `.tmp/**`.
- Reversible tuple durability law: persist `(run,step,patch_idx,path,pre_hash,post_hash,diff_hash,pre,post)` before/with apply.
- Apply guard: current hash must match `pre_hash`; rollback guard: current hash must match `post_hash`.
- Idempotence law: apply accepts already-postimage; rollback accepts already-preimage; other mismatch => fail-closed.
- Any post-apply failure path must rollback applied patches in reverse index order before terminal projection.

## HITL + Event Kernel

- ABI freeze: keys `ui:<g>|ui:<g>:result|decision:<g>|ui:<g>:audit`; topics `human:<g>|sys:<k>`.
- Canonical decision path is `awaitHuman`; no pre-approval bypass.
- HITL ingress accepts only `waiting_input` lanes.
- Reply/event ingress must resolve `(run,gate)`, verify gate/topic match, then ledger+send.
- Interaction x-once tuple: `(workflow_id,gate_key,topic,dedupe_key)`.
- Semantic drift guard required on reused dedupe key across topic/payload (`409` on drift).
- Dedupe durability law: never finalize terminal ledger state before observable effect/send safety.
- `origin` mandatory at contract+SQL boundaries; allowed enum closed.
- Gate GET supports bounded long-poll only (`timeoutS` validated integer range).
- Escalation is separate deterministic WF: `workflowID=esc:<wid>:<gate>`.
- Streams are adjunct UX only: workflow-scoped key, seq-ordered, explicit terminal close; never proof oracle.

## Ops + Compat Kernel

- Cancel/resume/fork are guard-based and fail-closed (`409` illegal transition/state/step).
- Accepted ops action appends OPS artifact containing `actor` + `reason`.
- Ops listings/projections deterministic and bounded (newest-first windows).
- Legacy compat routes (`/intents/:id/run`, `/runs/:id/approve-plan`) are explicit compat-only surface.
- Compat gate env: `ENABLE_LEGACY_RUN_ROUTES=true|false`; disabled => deterministic `410`; enabled => deprecation headers.

## Proof Floor

- Bootstrap: `MISE_TASK_OUTPUT=prefix mise install`.
- Edit-set gate: `mise run quick`.
- Pre-merge gate: `mise run check`.
- Signoff gate: `mise run full`.
- Repeats/soaks admissible only via forced run: `mise run -f <task>`.
- Mandatory proofs:
- happy path `POST /api/intents -> POST /api/runs -> GET /api/runs/:wid` terminal.
- `/api/run` idempotent hash/ref path with persisted `intent_hash|recipe_ref|recipe_hash`.
- fail-closed ingress/policy: malformed JSON/schema/policy => `400` + zero writes.
- SQL x-once duplicates stay zero (`run_steps`,`artifacts`,`human_interactions`,`decision keys`).
- crash durability: `mise run -f wf:crashdemo` => `SUCCESS` + marks `s1:1,s2:1`.
- partition signoff requires `SBX_QUEUE_PARTITION=true`.
- topology parity: shim `/healthz`, enqueue/read split, shared `DBOS__APPVERSION`.
- repro-pack completeness includes `app.*` + DBOS `workflow_status` and `workflow_events` for parent+child scope.
- task graph truth: `mise tasks deps check`.
- release rule: any `quick|check|full` failure => `NO_GO`.

## Coding Posture

- Prefer pure functions, total parsers, explicit state machines/dataflow.
- Return unions/Results at boundaries; avoid throw-driven control flow for expected states.
- Names encode intent (`assert*|parse*|toRow*|fromRow*|project*|resolve*`).
- Encode impossible states in types; avoid boolean soup/implicit defaults.
- Comments only for invariants/tradeoffs.
- Every semantic fix ships fail-before/pass-after durable proof in same change.
- Recurring failures become automation (gate/test/fixture), never tribal memory.

## Runtime Matrix

- Pins: `Node 24`, `postgres:18.2`.
- OC: `OC_MODE=replay|record|live` (default `replay`).
- SBX: `SBX_MODE=mock|live` (default `mock`), `SBX_PROVIDER=e2b|microsandbox` (default `e2b`).
- SBX alt-provider gate: `SBX_ALT_PROVIDER_ENABLED=true|false` (default `false`).
- Queue partition: `SBX_QUEUE_PARTITION=true|false` (default `true`; signoff requires `true`).
- Topology parity var: `DBOS__APPVERSION=<string>` (default `v1`).
- Live signoff posture: strict fail-closed `OC_STRICT_MODE=1`; permissive mode is non-signoff.

## Current Pins + Quirks

- Runtime SoT: DBOS SDK `v4.9.11`; legacy custom PG workflow service is harness/canary only.
- OpenCode spec pin: `v1.2.6` (2026-02-16); bump explicitly.
- DBOS quirks: `system_database_url` snake_case only; no `${VAR:-default}` placeholders.
- Decorator runtime requires `experimentalDecorators` + `emitDecoratorMetadata`.
- DBOS admin port is isolated from app port.

## Imports

@.codex/rules/10-task-ci.md
@.codex/rules/20-backend-ts.md
@.codex/rules/30-db-workflow.md
@.codex/rules/40-tests-determinism.md
@.codex/rules/50-ui-content.md
