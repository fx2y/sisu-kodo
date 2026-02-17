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

- Postgres version pin is strict (`18.2` image). DB tasks must remain docker-compose based.
- DB scripts must be idempotent and safe on rerun; no destructive wildcard operations.
- Test/integration DBs are ephemeral; name must be unique per run (`sha+pid` pattern).
- Migration/seed order is lexical, deterministic, and replayable.
- Workflow correctness is DB-driven:
  - `workflow_runs` row is singleton by `workflow_id`.
  - `marks(run_id,step)` PK enforces exactly-once markers.
  - writes use `ON CONFLICT DO NOTHING` where duplication is possible.
- Crash-resume assertion is exact counts (`s1=1,s2=1`), never log-grep heuristics.
- Resume logic must rehydrate incomplete runs from DB before serving traffic.
- Transaction discipline: lock row when deriving phase; commit only after phase mutation is coherent.
- Debug order when durability fails: DB health -> app boot/healthz -> workflow row -> marks counts.
