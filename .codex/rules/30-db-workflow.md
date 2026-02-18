---
description: DB durability + workflow execution invariants
paths:
  - "db/**/*.sql"
  - "src/workflow/**/*.ts"
  - "src/db/**/*.ts"
  - "scripts/db/**/*.sh"
  - "scripts/wf-*.sh"
  - "scripts/assert-marks.ts"
---

# DB + Workflow Rules

- DB pin is strict: dockerized `postgres:18.2`; no host-DB assumptions.
- Migrations/scripts must be deterministic, ordered, idempotent, rerun-safe.
- Schema split is hard: product tables in `app.*`, runtime tables in `dbos.*`.
- Test/integration DBs must be ephemeral + uniquely named per run.
- Exactly-once core is mandatory:
- singleton workflow run identity (`workflowID=intentId`).
- `marks(run_id,step)` primary key.
- duplicate-prone writes use `ON CONFLICT DO NOTHING`.
- Pre-enqueue queue policy is fail-closed: validate recipe/workload/caps before enqueue; reject with `400`; write nothing on reject.
- Split topology contract:
- API shim enqueues/reads via DBOS client and must not import workflow internals.
- Worker must import/register all workflows.
- Shim and worker `application_version` must match.
- Crash/chaos proofs require isolated ports, stale-process drain, and unique workflow identity per run (or explicit system-DB reset).
- Recovery/repair semantics:
- terminal deterministic failure projects to `retries_exceeded` + `next_action=REPAIR`.
- retry resume point derives from persisted `run_steps` completeness.
- HITL events accepted only from `waiting_input`.
- Durability oracle is SQL only (`app.runs`, `app.run_steps`, `app.mock_receipts`, `app.opencode_calls`, `dbos.workflow_status`), never logs.
- Ops triage order: DB health -> `/healthz` -> `app.runs` -> step artifacts -> `dbos.workflow_status`/queue state.
