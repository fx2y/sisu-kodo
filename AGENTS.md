# Sisu-Kodo Constitution

Single policy root: `AGENTS.md` + scoped `.codex/rules/*.md`.
Legend: `WF` deterministic workflow control, `ST` IO step, `SBX` sandbox execution.

## Authority

1. `AGENTS.md`
2. `.codex/rules/*`
3. nearest spec/contracts/tests
   Conflict resolver: stricter deterministic fail-closed law wins.

## Compounding Loop (Mandatory)

- Per iteration distill `spec-0/00-learnings.jsonl` + current `*-tasks.jsonl` + `*-tutorial.jsonl`.
- Promote only durable laws: ABI, identity, x-once, topology, proof floors, recurring failure classes.
- Drop narrative/changelog/one-offs; keep terse invariants only.
- Drift order strict: `policy -> tests/tasks -> code`.
- Recurring bug => automation (`policy|test|fixture|task`) in same change.
- Keep this file kernel-only; path-local detail belongs in `.codex/rules/*`.

## Decision Kernel

- Priority: `public-contract > determinism/fail-closed > SQL-provable x-once > throughput/ergonomics/style`.
- Bans: retry-as-fix, silent fallback, logs-as-proof, grep-only policy gates, clock/random identity in deterministic paths.
- Oracle order: `app.*` SQL -> `dbos.workflow_status/events` -> API JSON; logs narrative-only.
- Release truth: `mise` DAG `quick < check < full`; any red lane => `NO_GO`.

## Architecture Kernel

- Import DAG only: `config -> {db,workflow,server,oc,sbx,lib}`; no reverse/cross leaks.
- Env ingress only `src/config.ts`; downstream raw `process.env` forbidden.
- Hard seams: `WF` control-only, `ST` IO-only, repo SQL-map-only.
- OC boundary: only `src/oc/**` touches SDK via `OCClientPort`.
- SBX boundary: `RunInSBXPort={provider,run,health}`; default `e2b`; alt provider requires explicit gate else fail-closed.
- Runtime topology: `WORKFLOW_RUNTIME_MODE=api-shim|inproc-worker` (default `api-shim`); API process enqueue/read only.
- Split topology: shim enqueue/read only; worker executes internals; shared `DBOS__APPVERSION` mandatory.

## Contract Kernel

- One Ajv kernel `src/contracts/**`; flow fixed: `parse/assert -> service -> repo -> asserted egress`.
- Boundary order fixed `ingress -> db-load -> step-out -> egress`; no boundary casts.
- Lattice fixed: `400` malformed/validation/policy, `404` missing, `409` drift/illegal state, `500` unexpected.
- Malformed JSON/schema/policy => deterministic JSON `400` + zero writes.
- API truth: Next `/api/**`; shim/manual routes preserve contract+error parity.
- Ops WF surface exact-six: `list|get|steps|cancel|resume|fork`.

## Recipe + Identity Kernel

- RecipeSpec ABI strict (`additionalProperties:false`) at all boundaries; unknown keys => `400`.
- Storage: append-only `app.recipe_versions`; only mutable pointer `app.recipes.active_v`.
- Lifecycle fixed `draft -> candidate -> stable`; stable immutable; repair by new version.
- Candidate->stable requires `eval>=1 && fixture>=1` in same txn as `active_v` flip.
- Content address: `sha256(canonicalStringify(json))`.
- Run identity: `intentHash=sha256(canon(intent))`, `intentId=ih_<hash>`, `workflowID=intentId`.
- `/api/run` canonical ingress; `/api/runs` legacy adapter.
- Duplicate start idempotent success; identity tuple drift (`hash|ref|payload|queue/budget`) => `409`.
- Pinned `recipeRef{id,v}` forbids version override drift.

## Workflow + DB Kernel

- Stable step IDs `CompileST|ApplyPatchST|DecideST|ExecuteST`; outputs/artifacts persist before step return.
- Exactly-once DB law: PK/unique + `ON CONFLICT DO NOTHING` + semantic load/compare.
- History append-only `run_steps|artifacts|sbx_runs|human_interactions|eval_results`; projections declare latest-wins.
- Status merge monotonic: never terminal->nonterminal downgrade; reopen only explicit repair.
- Fanout identity: `workflowID=taskKey=SHA256(canonical{intentId,runId,stepId,normalizedReq})`.
- Queue classes fixed `compileQ|sbxQ|controlQ|intentQ`; no aliases.
- Queue law: parent WF only `intentQ`; fanout child only `sbxQ`.
- Lane taxonomy fixed at ingress `interactive|batch` with defaults `1|1000`.
- Enqueue options (`dedupe|priority|partition|timeout`) composed only via `src/workflow/intent-enqueue.ts`.
- Queue edge must carry dedupe or priority; explicit priority on non-priority queue => fail-closed.
- Partition law: when enabled, nonblank `queuePartitionKey` mandatory + propagated parent->child->worker.
- Deterministic paths ban `Math.random|Date.now|new Date|process.hrtime|crypto.randomUUID`; WF time via DBOS seam.

## ApplyPatch + Reversibility Kernel

- `ApplyPatchST` output replay-deterministic; no wall-clock replay fields.
- Patch target scope fail-closed to workspace `.tmp/**`.
- Persist reversible tuple `(run,step,patch_idx,path,pre_hash,post_hash,diff_hash,pre,post)` before/with apply.
- Apply guard `current==pre_hash`; rollback guard `current==post_hash`.
- Idempotence: apply accepts already-postimage, rollback accepts already-preimage; else fail-closed.
- Post-apply failure must rollback applied patches in reverse patch index before terminal projection.

## HITL + Event Kernel

- ABI freeze keys `ui:<g>|ui:<g>:result|decision:<g>|ui:<g>:audit`; topics `human:<g>|sys:<k>`.
- Canonical decision path `awaitHuman`; no pre-approval bypass; ingress accepts only `waiting_input` lanes.
- Reply/event ingress resolves `(run,gate)`, verifies gate/topic match, then ledger+send.
- Interaction x-once tuple fixed `(workflow_id,gate_key,topic,dedupe_key)`.
- Reused dedupe key with topic/payload semantic drift => deterministic `409`.
- Never finalize terminal ledger before observable effect/send safety.
- DBOS send constraint: workflow dedupe uses event-ledger key `send:<topic>:<dedupeKey>` + payload-hash guard.
- `origin` mandatory at contract+SQL boundaries; enum closed.
- Gate GET bounded long-poll only (`timeoutS` validated int range).
- Escalation WF identity fixed `workflowID=esc:<wid>:<gate>`.
- Streams adjunct UX only (workflow-scoped, seq-ordered, explicit close); never proof oracle.

## SBX + Budget Kernel

- `app.sbx_templates` immutable PK `(recipe_id,recipe_v,deps_hash)`; duplicate path semantic-compare, drift fail-closed.
- Execute template selection resolves from durable run recipe tuple; template ref/key enters task identity.
- Provider boot evidence (`source|templateId|templateKey|depsHash|envRef|bootMs`) must persist as durable artifact.
- Budget guard is one pure seam for ingress+runtime (`maxFanout|maxSBXMinutes|maxArtifactsMB|maxRetriesPerStep|maxWallClockMS`).
- Budget violation must persist deterministic `BUDGET` artifact before terminal status.

## Ops + Compat Kernel

- Cancel/resume/fork guard-based + fail-closed (`409` illegal transition/state/step).
- Accepted ops action appends OPS artifact with mandatory `actor` + `reason`.
- Ops listings deterministic, bounded, newest-first stable sort.
- `/api/ops/queue-depth` reads system DB oracle view `app.v_ops_queue_depth` via sys pool.
- Legacy compat routes (`/intents/:id/run`, `/runs/:id/approve-plan`) are compat-only surface.
- Compat env gate: `ENABLE_LEGACY_RUN_ROUTES=false => 410`, `true => deprecation headers`.

## Proof Floor

- Bootstrap `MISE_TASK_OUTPUT=prefix mise install`; gates `quick`,`check`,`full`; repeats/soaks only `mise run -f <task>`.
- Mandatory proofs:
- `POST /api/intents -> POST /api/runs -> GET /api/runs/:wid` terminal.
- `/api/run` hash/ref idempotency with persisted `intent_hash|recipe_ref|recipe_hash`.
- malformed ingress/policy => `400` + zero writes.
- SQL x-once duplicates stay zero (`run_steps|artifacts|human_interactions|decision keys`).
- crash durability `mise run -f wf:crashdemo` => `SUCCESS` + marks `s1:1,s2:1`.
- partition signoff requires `SBX_QUEUE_PARTITION=true`.
- topology parity: shim `/healthz`, enqueue/read split, shared `DBOS__APPVERSION`.
- task graph truth `mise tasks deps check`.
- repro-pack includes `app.*` + DBOS `workflow_status/events` for parent+child scope.
- perf proof uses sequential k6 lanes; fixed-port parallelism invalid evidence.
- Any `quick|check|full` failure => `NO_GO`.

## Coding Posture (Ultra-Opinionated)

- Prefer pure functions, total parsers, explicit state machines, dataflow over side effects.
- Boundary APIs return unions/Results; expected states never use throw-driven control flow.
- Semantic conflicts are typed domain errors mapped to lattice; never generic 500.
- Names encode role `parse*|assert*|toRow*|fromRow*|project*|resolve*|enforce*`.
- Encode impossible states in types; no boolean soup, hidden defaults, magic strings.
- Comments only for invariants/tradeoffs/why; never narrate obvious code.
- Keep modules small/branch-transparent; prefer composition seams over inheritance.
- Every semantic fix ships fail-before/pass-after durable proof in same change.

## Runtime Matrix

- Pins: `Node 24`, `postgres:18.2`.
- OC: `OC_MODE=replay|record|live` (default `replay`).
- SBX: `SBX_MODE=mock|live` (default `mock`), `SBX_PROVIDER=e2b|microsandbox` (default `e2b`).
- SBX alt-provider gate: `SBX_ALT_PROVIDER_ENABLED=true|false` (default `false`).
- Queue partition: `SBX_QUEUE_PARTITION=true|false` (default `true`; signoff requires `true`).
- Runtime mode: `WORKFLOW_RUNTIME_MODE=api-shim|inproc-worker` (default `api-shim`).
- Topology parity var: `DBOS__APPVERSION=<string>` (default `v1`).
- Live signoff posture: strict fail-closed `OC_STRICT_MODE=1`; permissive mode non-signoff.

## Current Pins + Quirks

- Runtime SoT: DBOS SDK `v4.9.11`; legacy custom PG workflow service harness/canary only.
- OpenCode spec pin: `v1.2.6` (2026-02-16); bump explicitly.
- DBOS quirks: `system_database_url` snake_case only; no `${VAR:-default}` placeholders.
- DBOS blocks workflow-context send idempotency keys and send inside step/txn contexts.
- Decorator runtime requires `experimentalDecorators` + `emitDecoratorMetadata`.
- DBOS admin port isolated from app port.

## Imports

@.codex/rules/10-task-ci.md
@.codex/rules/20-backend-ts.md
@.codex/rules/30-db-workflow.md
@.codex/rules/40-tests-determinism.md
@.codex/rules/50-ui-content.md
