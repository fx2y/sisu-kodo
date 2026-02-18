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

- `mise` is the only orchestration DSL; npm/pnpm scripts may mirror, never lead.
- Canonical tiers stay explicit unless intentionally redesigned:
- `quick=fmt+lint+type+unit+policy`.
- `check=quick+integration+wf`.
- `full=check+e2e+soak+live-smokes`.
- Use `depends` for composition; avoid hidden nested shell DAGs.
- Metadata contract is strict:
- any task with `run` must declare `sources`.
- expensive tasks must declare `outputs` or `outputs.auto=true`.
- only always-run exceptions: `db:reset|db:sys:reset|test:e2e`.
- Reset tasks must never be cached via outputs.
- Conflict-prone lanes (shared DB/system-DB/ports) must be serialized; prefer global `[settings].jobs=1` when overlap risk exists.
- Any port-binding task must accept env overrides (`PORT`, peer ports).
- Repeat/soak evidence must force rerun: `mise run -f ...`.
- CI contract: `mise install` then `mise run ci:*`; no bespoke CI shell orchestration.
- Pins/env are policy: Node24, postgres:18.2, `TZ/LANG/LC_ALL/NODE_ENV/CI`, `MISE_TASK_OUTPUT=prefix`.
- Task-policy gates must self-test negative probes to prevent false-green regex/lint drift.
