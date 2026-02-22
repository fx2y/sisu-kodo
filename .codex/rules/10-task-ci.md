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

- `mise` is orchestration SoT; package scripts are mirrors.
- DAG is explicit/monotonic via `depends`: `quick < check < full`.
- `quick` = fmt+lint+type+unit+policy; `check` = quick+integration+wf+contract smokes; `full` = check+e2e+release smokes.
- Tasks declare truthful `sources`; expensive tasks declare `outputs`/`outputs.auto=true`.
- Always-run tasks stay minimal (reset/e2e/soak).
- Deterministic reset order is fixed: `db:sys:reset` then `db:reset`.
- Global task env must not shadow runtime port overrides (`PORT`, admin/daemon peers); overrides must remain effective.
- CI entrypoint is fixed: `mise install && mise run ci:*`.
- Baseline pins: Node24, postgres:18.2, deterministic locale/time env (`TZ/LANG/LC_ALL/NODE_ENV/CI`), `MISE_TASK_OUTPUT=prefix`.
- Policy gates must be executable semantic probes (HTTP/SQL/contracts), never grep-only.
- Policy gates self-test `known-bad=>fail` and `known-good=>pass` before repo scan.
- Golden drift fails closed unless explicit refresh flag.
- Soak/repeat evidence is admissible only with forced run (`mise run -f ...`).
- OTLP/check smokes fail hard when required (`OTLP_REQUIRED=1`); no masking (`|| true`).
- Release decision rule: any `quick|check|full` failure => `NO_GO` regardless of partial pass lanes.
