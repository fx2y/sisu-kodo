---
description: mise/CI/task-graph policy; applies to orchestration files/scripts
paths:
  - "mise.toml"
  - "package.json"
  - ".github/workflows/*.yml"
  - "scripts/**/*.sh"
  - "scripts/**/*.ts"
---

# Task + CI Rules

- `mise` is the only orchestration DSL. npm/pnpm scripts may mirror, never lead.
- DAG tiers are fixed unless intentionally redesigned:
- `quick=fmt+lint+type+unit+policy`.
- `check=quick+integration+wf`.
- `full=check+e2e+soaks+live-smokes`.
- Task metadata is mandatory:
- any task with `run` MUST declare `sources`.
- expensive tasks MUST declare `outputs` or `outputs.auto=true`.
- state-reset tasks MUST NOT declare cached outputs (`db:reset`, `db:sys:reset`).
- sourceless run exceptions are explicit and minimal: `db:reset`, `db:sys:reset`, `test:e2e`.
- avoid duplicate command lanes: prefer `check:*` to compose `test:*` tasks via `depends`.
- Prefer `depends` for DAG transparency (`mise tasks deps` must stay truthful); avoid hidden nested shell chains.
- Conflict-prone lanes (shared DB/system-DB/ports) run under serialized scheduler (`[settings].jobs=1` / `MISE_JOBS=1`) for deterministic execution.
- Any port-binding task MUST accept env override (`PORT`/peer ports) to allow parallel DAG isolation.
- Repeated-run/soak validation MUST use `mise run -f ...`.
- CI workflow contract: `mise install` then `mise run ci:*`; no bespoke CI shell DAG.
- Env pins are policy, not hints: `TZ/LANG/LC_ALL/NODE_ENV/CI`, `MISE_TASK_OUTPUT=prefix`, pinned Node/PG defaults.
- On task regressions: fix `sources` scope first, then concurrency (`MISE_JOBS`), then implementation.
