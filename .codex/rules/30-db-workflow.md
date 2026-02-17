---
description: DB and crash-resume workflow invariants
paths:
  - "db/**/*.sql"
  - "src/workflow/**/*.ts"
  - "src/db/**/*.ts"
  - "scripts/db/**/*.sh"
  - "scripts/wf-*.sh"
  - "scripts/assert-marks.ts"
---

# DB + Workflow Rules

- PG pin is strict: `postgres:18.2` via docker compose; no host DB assumptions.
- DB scripts/migrations must be deterministic + rerun-safe (lexical order, idempotent ops, no wildcard destructives).
- Keep schema split hard: product tables `app.*`; runtime tables `dbos.*`.
- Test/integration DBs are ephemeral and unique per run (`sha+pid` pattern).
- Exactly-once core is non-negotiable:
- `workflow_runs` singleton by workflow id.
- `marks(run_id,step)` primary key.
- duplicate-prone writes use `ON CONFLICT DO NOTHING`.
- Durability proof is DB-only: exact `s1=1,s2=1`; never log-grep.
- Crash demos require unique `wf_id` per run or explicit system-DB reset.
- On boot, rehydrate unfinished runs from DB before serving traffic.
- Transaction rule: lock row before phase derivation; commit only coherent phase transition.
- For DBOS status, prefer SQL (`dbos.workflow_status`) over CLI text parsing.
- Triage order: DB health -> `/healthz` -> workflow row -> marks -> status table.
