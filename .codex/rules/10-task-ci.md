---
description: mise/CI/task-graph contract (single orchestration truth)
paths:
  - "mise.toml"
  - "package.json"
  - ".github/workflows/*.yml"
  - "scripts/**/*.sh"
  - "scripts/**/*.ts"
---

# Task + CI Rules

- `mise` is the only orchestrator. npm/pnpm scripts may mirror, never lead.
- DAG must be explicit and reviewable: `quick`, `check`, `full` wired via `depends`; no hidden shell DAGs.
- Canonical tiers:
- `quick=fmt+lint+type+unit+policy`
- `check=quick+integration+wf`
- `full=check+e2e+soak+live-smokes`
- Task metadata is strict:
- any task with `run` must declare `sources`
- expensive tasks must declare `outputs` or `outputs.auto=true`
- only always-run exceptions: `db:reset|db:sys:reset|test:e2e`
- Reset tasks must never be cached via outputs.
- Contention-prone lanes (DB/system-DB/ports) must serialize; if uncertain, force `[settings].jobs=1`.
- Port-binding tasks must honor env overrides (`PORT`, peer ports).
- Repeat/soak evidence must use forced rerun: `mise run -f ...`.
- CI contract: `mise install` then `mise run ci:*`; no bespoke CI shell choreography.
- Pin/env contract: Node24, postgres:18.2, deterministic locale/time env (`TZ/LANG/LC_ALL/NODE_ENV/CI`), `MISE_TASK_OUTPUT=prefix`.
- Policy gates must self-test both sides: known-bad fixture fails, known-good fixture passes.
- Baseline drift checks are fail-closed: missing baseline fails unless explicit bootstrap flag is set.
- Release proof lanes must cover B0..B6 intent: base reset, golden demo, break-path, recovery/HITL, OC contract, durability/soak, release gate.
