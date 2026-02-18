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
- Reset order is deterministic: drop/reset schema before migrations; e2e lanes must reset app+system DB when needed.
- Test/integration DBs must be ephemeral and uniquely named per run.

## Exactly-Once + Replay

- Exactly-once is DB-enforced, never implied:
- singleton workflow identity (`workflowID=intentId`)
- `marks(run_id,step)` primary key
- duplicate-prone writes use `ON CONFLICT DO NOTHING`
- ledger dedupe key (`op_key`) is DB-unique and read-before-call gate
- Replay oracle is SQL only (`app.runs`, `app.run_steps`, `app.mock_receipts`, `app.opencode_calls`, `dbos.workflow_status`), never logs.

## Queue + Topology

- Queue policy is pre-enqueue fail-closed: validate recipe/workload/caps before enqueue; on violation return `400` and write nothing.
- Queue class derivation must be deterministic (`compileQ|sandboxQ|controlQ`).
- API shim is black-box enqueue/read only; it must not import workflow internals.
- Worker imports/registers workflows and executes them.
- Shim and worker `application_version` must match.

## Recovery + HITL

- Terminal deterministic failure projects `retries_exceeded` + `next_action=REPAIR`.
- Retry resume point derives from persisted `run_steps` completeness, not memory.
- HITL events are accepted only in `waiting_input`.
- Retry/event endpoints return stable envelopes and status codes.

## Evidence + Triage

- Crash/chaos proofs require isolated ports and unique workflow identity (or explicit system-DB reset).
- Artifact records must store real SHA-256 integrity digests.
- Ops triage order: DB health -> `/healthz` -> `app.runs` -> step artifacts -> `dbos.workflow_status`/queue.
