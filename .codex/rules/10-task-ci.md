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

- `mise` is the DSL. Keep npm/pnpm scripts as thin mirrors only; never primary doc/CI surface.
- Every task with `run` MUST define `sources`; expensive tasks MUST define `outputs` or `outputs.auto=true`.
- Preserve gradient tiers:
  - `quick`: fmt+lint+type+unit only.
  - `check`: `quick` + integration(mock DB) + durability (`wf:crashdemo`).
  - `full`: `check` + e2e + OC live smoke + SBX live smoke.
- Preserve env pins: `TZ/LANG/LC_ALL/NODE_ENV/CI`, `MISE_TASK_OUTPUT=prefix`, Node24, DB port/user defaults.
- Soak/repeat validators MUST use `mise run -f ...` to defeat incremental-cache false positives.
- CI parity is non-negotiable: workflows call `mise install` + `mise run ci:*`; no bespoke shell DAGs.
- New task class? add namespace (`x:*`), add into DAG intentionally, add verification note in `AGENTS.md`.
- If task speed regresses, first fix scope (`sources`), then parallelism (`MISE_JOBS`), then algorithm.
