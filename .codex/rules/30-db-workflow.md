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
- Migrations must be ordered, idempotent, rerun-safe under partial state.
- Schema split is hard: product state in `app.*`, runtime state in `dbos.*`; wrong-target writes fail closed.
- Exactly-once is SQL-enforced: PK/unique keys + `ON CONFLICT DO NOTHING` + semantic divergence guard.
- Product identity fixed: `workflowID=intentId=ih_<sha256(canon(intent))>`.
- Fanout identity fixed: `workflowID=taskKey=SHA256(canonical{intentId,runId,stepId,normalizedReq})`.
- Step set fixed: `CompileST|ApplyPatchST|DecideST|ExecuteST`; step rows/artifacts persist before return.
- History is append-only: `run_steps`,`artifacts`,`sbx_runs`,`human_interactions`; projections must declare latest-wins.
- Status law is monotonic in every SQL write path: no terminal->nonterminal downgrade except explicit repair reopen.
- Queue topology fixed: parent on `intentQ`, child on `sbxQ`, deterministic class derivation.
- Partition mode requires nonblank `queuePartitionKey` propagated parent->child->worker.
- Split topology law: shim enqueue/read only; worker executes internals; shared `DBOS__APPVERSION` mandatory.
- HITL ingress law: resolve `(run,gate)` + require `waiting_input` + gate/topic match before ledger/send.
- HITL x-once tuple `(workflow_id,gate_key,topic,dedupe_key)` is mandatory; same dedupe key with payload/topic drift => `409`.
- `origin` is mandatory/non-null/closed-enum in contract + SQL boundaries.
- Gate GET long-poll is bounded (`timeoutS` validated range).
- Escalation workflow ID fixed: `esc:<wid>:<gate>`.
- Reversible patch law: apply/rollback hash guards, deterministic reverse-order rollback on post-apply failure, idempotent already-pre/post acceptance.
- Patch target scope is fail-closed to workspace `.tmp/**`.
- Artifact law: canonical `artifact://` URI + SHA-256(64hex); sentinel output rules are explicit and deterministic.
- Repro/triage order is fixed: `/healthz` -> run/gate API -> `app.*` -> `dbos.workflow_status/events` -> logs.
