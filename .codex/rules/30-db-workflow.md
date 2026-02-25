---
description: DB durability, workflow identity, queue/HITL/SBX invariants
paths:
  - "db/**/*.sql"
  - "src/workflow/**/*.ts"
  - "src/db/**/*.ts"
  - "scripts/db/**/*.sh"
  - "scripts/wf-*.sh"
  - "scripts/assert-marks.ts"
---

# DB + Workflow Rules

- DB runtime pin strict: `postgres:18.2`; no host-DB assumptions.
- Migrations ordered, additive-safe, rerun-safe under partial state.
- Schema split hard: product `app.*`, runtime `dbos.*`; wrong-target writes fail closed.
- Exactly-once SQL law: PK/unique + `ON CONFLICT DO NOTHING` + semantic divergence guard.
- Product identity fixed `workflowID=intentId=ih_<sha256(canon(intent))>`.
- Fanout identity fixed `workflowID=taskKey=SHA256(canonical{intentId,runId,stepId,normalizedReq})`.
- Step IDs fixed `CompileST|ApplyPatchST|DecideST|ExecuteST`; outputs/artifacts persist before return.
- History append-only `run_steps|artifacts|sbx_runs|human_interactions|eval_results`; status writes monotonic.
- Queue topology fixed: parent `intentQ`, child `sbxQ`, classes `compileQ|sbxQ|controlQ|intentQ` only.
- Partition mode requires nonblank `queuePartitionKey` propagated parent->child->worker.
- Queue edge must carry dedupe or priority; explicit priority on non-priority queue fails closed.
- Split topology: shim enqueue/read only, worker executes internals, shared `DBOS__APPVERSION` required.
- Split DB law: app/system correlation is two-phase lookup only; cross-db join is illegal.
- HITL ingress: resolve `(run,gate)`, require `waiting_input`, enforce gate/topic match before ledger/send.
- HITL x-once tuple fixed `(workflow_id,gate_key,topic,dedupe_key)`; semantic dedupe drift => `409`.
- `origin` mandatory at contract+SQL boundaries; closed enum.
- Gate GET bounded long-poll only (`timeoutS` validated range); escalation id fixed `esc:<wid>:<gate>`.
- Workflow send dedupe uses event-ledger key `send:<topic>:<dedupeKey>` + payload-hash guard.
- Reversible patch law: hash guards, reverse-order rollback on post-apply failure, idempotent pre/postimage acceptance.
- Patch target scope fail-closed to workspace `.tmp/**`.
- SBX template registry immutable (`app.sbx_templates` keyed by `recipe_id,recipe_v,deps_hash`); duplicate drift fails closed.
- SBX boot/template evidence persists as durable artifact (`template source/id/key/hash/envRef`, `bootMs`).
- Budget violations persist deterministic `BUDGET` artifact before terminal projection.
- Triage oracle order fixed: `/healthz -> run/gate API -> app SQL -> dbos SQL -> repro-pack -> logs`.
