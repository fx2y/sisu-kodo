# Sisu-Kodo Agent Constitution

Repo policy source-of-truth. Keep exactly one repo-level agent file: this file. Put scoped detail in `.codex/rules/*.md`; never add nested `AGENTS.md`.

## Operating Loop

- Install/toolchain: `mise install` (Node 24, pnpm, env pins).
- Inner loop (every edit): `mise run quick`.
- Pre-merge gate: `mise run check`.
- Slow/nightly/regression: `mise run full`.
- Repeated-run/soak checks MUST bypass cache: `mise run -f <task>` (ex: `wf:crashdemo`).

## Command Canon (mise-only)

- Build: `mise run build`.
- Validate: `mise run fmt:check lint type test:unit`.
- DB: `mise run db:up db:reset` (+ `db:test:create/drop` for ephemeral integration DBs).
- Durability: `mise run wf:crashdemo` and `mise run wf:crashdemo:soak`.
- Policy: `mise run policy:task-sources`.
- CI must call `mise run ci:*`; docs must not present `npm|pnpm run` as primary path.

## Hard Invariants

- Determinism is fail-closed: no uncontrolled net/time/random/ports.
- Entropy API ban outside wrappers: `Math.random|Date.now|new Date|process.hrtime|crypto.randomUUID`.
- Network denied in tests except localhost; unit tests freeze time + seeded RNG.
- Runtime pin: Node 24; DB pin: Postgres 18.2 container.
- DB ops run container-side via `docker compose exec psql`; no host `psql` dependency.
- Workflow durability invariant is DB-verified, not log-scraped: marks must settle at `s1=1,s2=1`.
- Workflow/idempotency semantics enforced by schema uniqueness + `ON CONFLICT DO NOTHING`.
- `MISE_TASK_OUTPUT=prefix` only (`line` caused runtime breakage).
- Task graph is explicit (`check=quick+integration+wf`); no hidden shell orchestration.
- Expensive tasks require `sources` + `outputs|outputs.auto`; missing metadata is a policy failure.

## Architecture + State Policy

- Module seams stay strict: `config|db|workflow|server|oc|sbx|lib`.
- Durable truth lives in Postgres; in-memory state may only dedupe/schedule transient work.
- HTTP surface is JSON-only, deterministic fields/statuses, explicit 4xx/5xx paths.
- `lib/*` wrappers own non-deterministic primitives; all other code consumes wrappers.
- Prefer pure functions; classes only for long-lived lifecycle/stateful services.
- Exported APIs must be explicitly typed; no `any`/shape guessing at boundaries.

## Debug Playbooks (symptom -> fix)

- `mise` panics/invalid output mode -> force `MISE_TASK_OUTPUT=prefix`.
- Soak falsely green/skipping -> rerun with `-f`; ensure task has real `sources`.
- Duplicate workflow side effects -> inspect `app.marks` PK + `ON CONFLICT` paths.
- `wf:crashdemo` timeout -> verify `build` artifact, `/healthz`, DB health, then marker query.
- Integration DB collisions/leaks -> use `db:test:create/drop`; verify `TEST_DB_NAME`.
- OC replay miss -> recompute fixture key `(intent,schemaVersion,seed)`; run `mise run oc:refresh`.

## Compounding Rule (living spec)

- Any bugfix/behavior change MUST add at least one: test, invariant update, or both.
- Any new recurring failure mode MUST be encoded as: task gate, lint/policy script, or test.
- If `mise` task behavior changes, update `mise.toml` + matching rule doc in same PR.
- If semantics change without tests, PR is invalid.

## Known Current Constraints (do not hand-wave)

- DBOS SDK not integrated yet; durability currently custom PG-backed service.
- `oc:live:smoke` is contract-stub unless real provider endpoint/creds are wired.
- `sbx:live:smoke` is shell adapter unless microVM runner is integrated.

## Imports

@.codex/rules/10-task-ci.md
@.codex/rules/20-backend-ts.md
@.codex/rules/30-db-workflow.md
@.codex/rules/40-tests-determinism.md
@.codex/rules/50-ui-content.md
