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
- Migrations are ordered/idempotent/rerun-safe under partial state.
- Schema split is hard: product state `app.*`, runtime state `dbos.*`; DB-targeting mistakes fail closed.
- Reset order is deterministic: `db:sys:reset` then `db:reset`.
- Exactly-once is SQL law: PK/unique dedupe keys + `ON CONFLICT DO NOTHING` for duplicate-prone writes.
- Product identity: `workflowID=intentId`; fanout identity: `workflowID=taskKey=SHA256(canonical{intentId,runId,stepId,normalizedReq})`.
- History is append-only (`run_steps`,`artifacts`,`sbx_runs`); latest-wins projection rules must be explicit.
- Steps must persist rows/artifacts before return.
- Queue ingress is pre-enqueue fail-closed: invalid recipe/workload/caps/partition => `400` + zero writes.
- Queue topology is fixed: parent on `intentQ` only; fanout child on `sbxQ` only; class derivation deterministic.
- Partition mode requires non-blank `queuePartitionKey` propagated parent->child->worker.
- Split topology law: shim enqueue/read only, worker executes internals, shared `DBOS__APPVERSION` mandatory.
- Status law: no terminal->nonterminal downgrade except explicit repair reopen.
- HITL law: event lanes originate from `waiting_input`; gate ABI keys/topics are immutable.
- Interaction ledger tuple `(workflow_id,gate_key,topic,dedupe_key)` enforces x-once; payload/topic mismatch on reused dedupe key is conflict (`409`).
- Dedupe durability law: never commit terminal dedupe ledger state before send/effect observability.
- `origin` on human interactions is mandatory, closed enum, non-null.
- Escalation uses dedicated deterministic WF IDs `esc:<wid>:<gate>`.
- Artifact law: canonical `artifact://` URI + SHA-256(64hex) + durable `idx=0`; missing domain output emits sentinel `kind=none,idx=999`.
- Triage order is fixed: `/healthz` -> run/gate API -> `app.runs` -> `app.run_steps/artifacts/human_interactions` -> `dbos.workflow_status/events` -> logs.
