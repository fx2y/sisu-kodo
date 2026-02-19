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

- `mise` is the sole orchestrator; npm/pnpm scripts are mirrors only.
- DAG must stay explicit via `depends`: `quick=fmt+lint+type+unit+policy`, `check=quick+integration+wf`, `full=check+e2e+soak+live-smokes`.
- Task metadata law: every `run` task declares `sources`; expensive tasks declare `outputs|outputs.auto=true`; always-run exceptions only `db:reset|db:sys:reset|test:e2e`.
- Reset tasks are uncached; contention lanes (DB/system DB/ports) serialize (`[settings].jobs=1` when uncertain).
- Port tasks honor env overrides (`PORT`, peers, admin ports).
- Soak/repeat evidence is valid only via forced reruns: `mise run -f ...`.
- CI entrypoint is fixed: `mise install && mise run ci:*`; no bespoke shell choreography.
- Pin/env baseline: Node24, postgres:18.2, deterministic `TZ/LANG/LC_ALL/NODE_ENV/CI`, `MISE_TASK_OUTPUT=prefix`.
- Policy gates self-test both sides (known-bad fails, known-good passes).
- Baseline/golden drift checks fail-closed unless explicit bootstrap/refresh flag is set.
- Release evidence covers reset, happy path, break-path, recovery/HITL, OC/SBX smokes, durability/soak; `mise tasks deps check` must remain truthful.
