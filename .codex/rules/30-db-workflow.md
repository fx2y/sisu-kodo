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
- Schema split is hard: product state in `app.*`, runtime state in `dbos.*`.
- Migration targeting must be DB-aware (`dbos.*` changes go to system DB); cross-DB assumptions fail closed.
- Reset order is deterministic; when both reset, run `db:sys:reset` before `db:reset`.
- Test DBs are ephemeral and uniquely named per run.

- Exactly-once is DB law:
- singleton identity `workflowID=intentId`
- `marks(run_id,step)` PK
- unique dedupe keys on side-effect tables
- duplicate-prone writes via `ON CONFLICT DO NOTHING`
- Fanout identity is deterministic: `workflowID=taskKey`, `taskKey=SHA256(canonical{intentId,runId,stepId,normalizedReq})`.
- History is append-only (`run_steps`,`artifacts`,`sbx_runs`); projections must encode latest-wins explicitly.
- Replay oracle is SQL (`app.*`,`dbos.workflow_status`), never logs.
- Step rows/artifacts persist before step return.

- Queue policy is pre-enqueue fail-closed: validate recipe/workload/caps/partition before enqueue; violation => `400` + zero writes.
- Queue topology law: parent intent WF only `intentQ`, child fanout only `sbxQ`; class derivation deterministic (`compileQ|sbxQ|controlQ|intentQ`).
- Partition queues require non-blank `queuePartitionKey` propagated parent->child->worker.
- Split runtime law: shim enqueue/read only; worker executes WF internals; shim+worker `DBOS__APPVERSION` parity required.

- Recovery/HITL law: retries exhaust => `status=retries_exceeded` + `nextAction=REPAIR`.
- HITL events only from `waiting_input`; retry envelope fixed `{accepted,newRunId,fromStep}`.
- Status guard: terminal status cannot downgrade to nonterminal; sole exception is explicit repair transition.
- Ops control semantics are fail-closed:
- cancel allowed only from `PENDING|ENQUEUED`
- resume allowed only from `CANCELLED|ENQUEUED`
- fork rejects out-of-bounds `stepN` with `409`
- Ops artifacts on accepted actions must carry `actor` and `reason`.

- Artifact law: canonical `artifact://` URI + SHA-256(64hex) + durable `artifact_index idx=0`.
- Every step emits >=1 artifact; if no domain output emit sentinel (`kind=none`,`idx=999`).
- Triage order is fixed: DB health -> `/healthz` -> ops/run API -> `app.runs` -> `app.run_steps/artifacts` -> `dbos.workflow_status`.
