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
- Reset order is deterministic (schema reset before migrations); e2e/system-db lanes reset both DBs when required.
- Test DBs are ephemeral and uniquely named per run.

- Exactly-once is DB-enforced: singleton identity `workflowID=intentId`, `marks(run_id,step)` PK, DB-unique dedupe keys, duplicate-prone writes via `ON CONFLICT DO NOTHING`.
- Fanout identity uses `workflowID=taskKey`; `taskKey=SHA256(canonical{intentId,runId,stepId,normalizedReq})`.
- Attempt history is append-only (`run_steps`,`artifacts`,`sbx_runs`); projections must declare latest-wins logic explicitly.
- Replay oracle is SQL only (`app.runs`,`app.run_steps`,`app.mock_receipts`,`app.opencode_calls`,`dbos.workflow_status`), never logs.
- Step output rows/artifacts are persisted before step return.

- Queue policy is pre-enqueue fail-closed: validate recipe/workload/caps/partition before enqueue; violations => `400` + zero writes.
- Queue topology law: parent intent WF on `intentQ`, child SBX fanout on `sbxQ`; class derivation deterministic (`compileQ|sbxQ|controlQ|intentQ`).
- Partitioned queues require non-blank `queuePartitionKey` with full propagation parent->child.
- Split runtime law: shim enqueue/read only; worker registers/executes WF internals; shim+worker `DBOS__APPVERSION` parity required.

- Recovery/HITL law: terminal deterministic failure projects `retries_exceeded` + `nextAction=REPAIR`.
- HITL signals emitted only from `waiting_input`; retry envelope fixed `{accepted,newRunId,fromStep}`.
- Artifact law: canonical `artifact://` URI + real SHA-256 + durable `artifact_index` at `idx=0`.
- Every step emits >=1 artifact; if no domain output emit deterministic sentinel (`kind=none`,`idx=999`).
- Triage order is fixed: DB health -> `/healthz` -> `app.runs` -> artifacts -> `dbos.workflow_status`.
