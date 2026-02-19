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
- Migrations/scripts are deterministic, ordered, idempotent, rerun-safe.
- Schema split is hard: product state in `app.*`, runtime state in `dbos.*`.
- Reset order is deterministic: schema reset before migrations; e2e lanes reset app+system DB when required.
- Test DBs are ephemeral and uniquely named per run.

- Exactly-once is DB-enforced: singleton workflow identity (`workflowID=intentId`), `marks(run_id,step)` PK, dedupe keys DB-unique, duplicate-prone writes guarded by `ON CONFLICT DO NOTHING`.
- Attempt history is append-only (`run_steps`,`artifacts`,`sbx_runs`); latest-wins projections must be explicit.
- Replay oracle is SQL only (`app.runs`,`app.run_steps`,`app.mock_receipts`,`app.opencode_calls`,`dbos.workflow_status`), never logs.
- Queue policy is pre-enqueue fail-closed: validate recipe/workload/caps/partition keys before enqueue; violations => `400` + zero writes.
- Queue topology law: parent intent WF on `intentQ`; child SBX fanout tasks on `sbxQ`; queue class derivation deterministic (`compileQ|sbxQ|controlQ|intentQ`).
- Partitioned queues require non-blank partition key and end-to-end propagation.
- Split runtime: API shim is enqueue/read only; worker imports/registers workflows; shim+worker `application_version` must match.
- Recovery/HITL law: terminal deterministic failure projects `retries_exceeded` + `next_action=REPAIR`; resume point derives from persisted `run_steps`; HITL events only in `waiting_input`; retry envelope stable `{accepted,newRunId,fromStep}`.
- Evidence law: crash/chaos proofs need isolated ports + unique workflow identity (or explicit system-DB reset).
- Artifact law: canonical artifact URI + real SHA-256 digest; triage order is DB health -> `/healthz` -> `app.runs` -> artifacts -> `dbos.workflow_status`/queue.
