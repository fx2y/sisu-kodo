# 002 Durability-First Runbook (Operator + Dev Continuation)

## 0. Read This First

This repo is already a deterministic workflow harness, not a vague "agent" scaffold.
Treat it as proof-driven infra:

- control-plane: `mise` only (`mise.toml`)
- runtime truth: Postgres rows, not logs
- durability proof: `app.marks` settles to `{s1:1,s2:1}` after crash/restart
- API contract: strict Ajv validation + deterministic JSON envelopes
- status honesty: OC live + SBX live are stubs/adapters, not real provider/microVM production paths

If a change weakens one of those, reject it.

## 1. Current Reality (As Implemented)

### 1.1 What is shipped

- DBOS runtime boot/shutdown is wired in `src/main.ts`.
- HTTP API exists for:
  - `GET /healthz`
  - `POST /intents`
  - `POST /intents/:id/run`
  - `GET /runs/:id`
  - legacy proof routes `POST /crashdemo?wf=...`, `GET /marks?wf=...`
- DB domain tables exist (`app.intents`, `app.runs`, `app.run_steps`, `app.artifacts`) plus crash tables (`app.workflow_runs`, `app.marks`).
- DBOS workflows exist:
  - `CrashDemoWorkflow` (durability proof)
  - `IntentWorkflow` (minimal intent->run demo path)
- Golden projection test exists at `test/e2e/run-view-golden.test.ts` with baseline `test/golden/run-view.json`.
- CI calls `mise` only via `.github/workflows/ci.yml`.

### 1.2 What is intentionally partial

- `oc:live:smoke` uses a stub producer (`scripts/oc-live-smoke.ts`), no real provider call contract.
- `sbx:live:smoke` runs shell command adapter (`src/sbx/runner.ts`), no microVM engine.
- `src/workflow/engine-custom.ts` exists as alternate/reference engine but app boots `DBOSWorkflowEngine`.

### 1.3 Non-obvious but critical

- DBOS config keys are snake_case in `dbos-config.yaml` (`system_database_url`, `admin_port`), matching current DBOS behavior expectations.
- Admin port isolation is mandatory (`PORT` default `3001`, `ADMIN_PORT` default `3002`).
- reset tasks are intentionally uncached (`db:reset`, `db:sys:reset`) to avoid stale state illusions.

## 2. Zero-Drift Working Doctrine

1. Before edits: decide which invariant your change touches.
2. During edits: preserve seams (`config|db|workflow|server|oc|sbx|lib`).
3. After each edit set: run `mise run quick`.
4. Before claiming done on behavior changes: run relevant proof(s) from section 4.
5. If a recurring bug appears twice: encode it as gate/test/policy script in same PR.

## 3. Mental Model (Compressed)

- `src/server/http.ts` is boundary + gatekeeper.
- `src/workflow/port.ts` is runtime abstraction.
- `src/workflow/engine-dbos.ts` binds route events to DBOS workflows.
- Repos in `src/db/*Repo.ts` do SQL mapping only.
- Schemas in `src/contracts/*.schema.ts` are source of truth for ingress/egress shapes.
- `scripts/*.sh|.ts` are not extras; they are operational truth of proofs.

## 4. Walkthroughs (Primary Course)

### W0. Clean bootstrap (always start here)

```bash
mise install
mise run db:up
mise run db:reset
mise run db:sys:reset
mise run build
mise run quick
```

Pass signal: quick is green, db boot/reset deterministic.

### W1. Minimum durability proof (single command)

```bash
PORT=3004 ADMIN_PORT=3006 mise run -f wf:crashdemo
```

Internals (scripted in `scripts/wf-crashdemo.sh`):

1. boot app (proc1)
2. trigger crash workflow with unique id
3. kill proc1
4. boot app (proc2)
5. poll marks invariant via `scripts/assert-marks.ts`
6. assert `dbos.workflow_status.status='SUCCESS'`

### W2. Verify durability from DB directly

```bash
scripts/db/psql-sys.sh -c "SELECT workflow_uuid,status,updated_at FROM dbos.workflow_status ORDER BY updated_at DESC LIMIT 10;"
docker compose exec -T db psql -U postgres -d app_local -c "SELECT run_id,step,COUNT(*) c FROM app.marks GROUP BY run_id,step ORDER BY run_id DESC,step;"
```

Pass signal: recent run has exactly one `s1` + one `s2`.

### W3. Product flow (intent -> run -> runview)

Terminal A:

```bash
PORT=3001 ADMIN_PORT=3002 mise run start
```

Terminal B:

```bash
BASE=http://127.0.0.1:3001
curl -sS $BASE/healthz | jq
INTENT=$(curl -sS -X POST $BASE/intents -H 'content-type: application/json' -d '{"goal":"demo","inputs":{},"constraints":{},"connectors":[]}' | jq -r .intentId)
RUN=$(curl -sS -X POST $BASE/intents/$INTENT/run -H 'content-type: application/json' -d '{"traceId":"handoff-demo"}' | jq -r .runId)
for i in $(seq 1 40); do S=$(curl -sS $BASE/runs/$RUN | jq -r .status); [ "$S" = "succeeded" ] && break; sleep 0.1; done
curl -sS $BASE/runs/$RUN | jq
```

Pass signal: `status=succeeded`, step exists, deterministic keys, trace id round-trips.

### W4. Fail-closed ingress (syntax + schema)

```bash
curl -sS -o /tmp/bad-json -w '%{http_code}\n' -X POST $BASE/intents -H 'content-type: application/json' -d '{bad'
cat /tmp/bad-json

curl -sS -o /tmp/bad-intent -w '%{http_code}\n' -X POST $BASE/intents -H 'content-type: application/json' -d '{"inputs":{},"constraints":{}}'
cat /tmp/bad-intent

curl -sS -o /tmp/bad-run -w '%{http_code}\n' -X POST $BASE/intents/$INTENT/run -H 'content-type: application/json' -d '{"unknownField":"x"}'
cat /tmp/bad-run
```

Pass signal: all are deterministic 400s.

### W5. Non-write guard for invalid payloads

```bash
mise run test:integration:mock
```

Look at `test/integration/intents-db-guard.test.ts`: it asserts DB row counts do not increase on invalid payloads.

### W6. Golden contract proof

```bash
mise run test:e2e
```

If intentional view change:

```bash
mise run test:golden:refresh
mise run test:e2e
```

Golden policy: missing baseline fails; no silent auto-create unless explicit refresh task.

### W7. Full local CI-equivalent core

```bash
mise run check
mise tasks deps check
```

Pass signal: DAG remains explicit; `check` fanout is truthful.

### W8. Soak anti-false-green

```bash
mise run -f wf:crashdemo:soak
mise run -f test:unit:soak
```

Rule: `-f` is mandatory for any soak claim.

### W9. DB schema split sanity

```bash
scripts/db/psql-sys.sh -c '\dt dbos.*'
docker compose exec -T db psql -U postgres -d app_local -c '\dt app.*'
```

Pass signal: system tables in `dbos.*`, product tables in `app.*`.

### W10. DBOS CLI visibility

```bash
mise run dbos:workflow:list
WF=$(scripts/db/psql-sys.sh -t -A -c "SELECT workflow_uuid FROM dbos.workflow_status ORDER BY updated_at DESC LIMIT 1" | xargs)
mise run dbos:workflow:status "$WF"
```

If empty, app likely not launched or sys-db env miswired.

### W11. OC mode semantics

```bash
mise run oc:refresh
mise run oc:live:smoke
```

Interpretation:

- refresh writes deterministic fixture keyed by `intent+schemaVersion+seed`
- live smoke validates contract path, not real provider quality

### W12. SBX mode semantics

```bash
mise run sbx:live:smoke
```

Interpretation: shell execution adapter path only.

### W13. Unit determinism substrate

```bash
mise run test:unit
```

What it enforces (`test/setup.ts`): net deny except localhost, seeded RNG, frozen clock for unit suite.

### W14. Fast triage path for `EADDRINUSE`

```bash
PORT=3003 ADMIN_PORT=3005 mise run test:integration:mock
PORT=3004 ADMIN_PORT=3006 mise run -f wf:crashdemo
```

Always isolate app/admin ports in concurrent or repeated runs.

## 5. Extension Playbooks (How To Continue Correctly)

### P1. Add a new HTTP endpoint (do this exact order)

1. Add schema in `src/contracts/<x>.schema.ts`.
2. Compile with shared Ajv singleton only.
3. Add repo method if DB touch is needed.
4. Add handler in `src/server/http.ts`.
5. Gate ingress with assert function.
6. Gate egress if returning structured model.
7. Add integration test for fail path + success path.
8. Run `mise run quick` then relevant integration/e2e task.

Minimal skeleton:

```ts
// contracts
export function assertX(v: unknown): asserts v is X {
  assertValid(validate, v, "X");
}

// handler
const payload = JSON.parse(body);
assertX(payload);
```

### P2. Add a new workflow step in intent flow

1. Define output schema first.
2. Implement step method in `src/workflow/dbos/intentSteps.ts`.
3. Validate output before persistence.
4. Persist step via `insertRunStep` with deterministic fields.
5. Update golden if output shape is visible in run view.

### P3. Add DB table safely

1. New additive SQL migration in `db/migrations/`.
2. Never alter `dbos` schema in app migrations.
3. Keep migrations idempotent and lexical-order replay-safe.
4. Run `mise run db:reset` and integration tests.

### P4. Change RunView contract safely

1. Update schema `src/contracts/run-view.schema.ts`.
2. Update projection `src/server/run-view.ts` with deterministic key order.
3. Update tests that assert fields.
4. Refresh and re-assert golden.

### P5. Add or modify `mise` tasks safely

1. Keep `depends` explicit.
2. Every `run` task needs `sources`.
3. Expensive tasks need `outputs` or `outputs.auto`.
4. Reset tasks must remain uncached.
5. Re-run `mise run policy:task-sources` + `mise tasks deps check`.

### P6. Move OC from stub to real provider

1. Keep `runOC` replay/record/live interface stable.
2. Replace `producer` in live path with real call.
3. Validate response with `assertOCOutput` before any write.
4. Persist provider metadata in deterministic shape.
5. Add one integration smoke with strict timeout and deterministic envelope assertions.

### P7. Replace SBX shell adapter with microVM runner

1. Keep `runSandboxJob` return type stable (`exitCode/stdout/files`).
2. Preserve canonical file ordering (`stableFiles`).
3. Normalize line endings for snapshot parity.
4. Add live smoke using explicit command/template and deterministic artifact index.

## 6. High-Value File Map (Where To Edit)

- runtime boot: `src/main.ts`
- app wiring: `src/server/app.ts`
- route boundaries: `src/server/http.ts`
- response projection: `src/server/run-view.ts`
- workflow port: `src/workflow/port.ts`
- dbos engine: `src/workflow/engine-dbos.ts`
- intent wf logic: `src/workflow/dbos/intentWorkflow.ts`, `src/workflow/dbos/intentSteps.ts`
- crash wf proof: `src/workflow/dbos/crashDemoWorkflow.ts`, `src/workflow/dbos/steps.ts`
- db repos: `src/db/*.ts`
- contracts kernel/schemas: `src/contracts/*.ts`
- tasks policy graph: `mise.toml`, `scripts/policy-*.sh`
- durability proof scripts: `scripts/wf-crashdemo.sh`, `scripts/assert-marks.ts`
- determinism harness: `test/setup.ts`, `scripts/lint-flake.sh`

## 7. Known Sharp Edges

- `scripts/wf-crashdemo.sh` uses `date` + `$RANDOM` for wf ids; acceptable here (script-level proof utility) but keep deterministic semantics inside app code.
- `asRecord` in `src/contracts/assert.ts` currently uses a cast internally; avoid adding boundary casts elsewhere.
- `scripts/policy-no-bundlers.sh` uses `grep` over broad patterns; keep exclusions tight when adding tooling.

## 8. Delta: Current Build vs Spec North-Star

Already true now:

- deterministic harness + proof scripts + CI parity
- contract-gated HTTP ingress/egress for intent/run paths
- additive app schema for intents/runs/steps/artifacts

Still north-star / partial:

- real OC provider integration
- real SBX microVM integration
- broader workflow/domain semantics beyond current minimal intent pipeline

## 9. Recommended Next Execution Order

1. strengthen intent workflow semantics (real OC/SBX step chain under same contracts)
2. wire real OC live provider behind existing `runOC` interface
3. wire real microVM runner behind existing `runSandboxJob` interface
4. keep proofs green at each step: `quick`, `check`, `test:e2e`, forced soak

## 10. Final Rule

Do not optimize for code volume. Optimize for replayable proofs.
If a behavior change lacks at least one durable artifact (test, policy, invariant), it is incomplete.
