---
description: task graph + CI orchestration invariants
paths:
  - "mise.toml"
  - "package.json"
  - ".github/workflows/*.yml"
  - "scripts/**/*.sh"
  - "scripts/**/*.ts"
---

# Task + CI Rules

- `mise` is orchestration SoT; package scripts are mirrors only.
- DAG is explicit monotonic `quick < check < full` via `depends`; no implicit chaining.
- Lanes: `quick`=fmt+lint+type+unit+policy; `check`=quick+integration+workflow+contract smokes; `full`=check+e2e+release smokes.
- Tasks must declare truthful `sources`; expensive tasks declare `outputs`/`outputs.auto=true`.
- Always-run tasks must stay minimal (reset/e2e/soak only).
- Reset order is fixed: `db:sys:reset` then `db:reset`.
- CI entrypoint fixed: `mise install && mise run ci:*`.
- Baseline env pins: Node24, postgres:18.2, deterministic locale/time (`TZ/LANG/LC_ALL/NODE_ENV/CI`), `MISE_TASK_OUTPUT=prefix`.
- Policy gates are executable semantic probes (HTTP/SQL/contracts), never grep-only.
- Every policy gate must self-test `known-bad=>fail` + `known-good=>pass` before repo scan.
- Golden drift fails closed unless explicit refresh flag.
- Soak/repeat evidence is admissible only through forced rerun (`mise run -f ...`).
- Required-fidelity smokes (e.g. OTLP) fail hard when enabled; no masking (`|| true`).
- Any `quick|check|full` red lane is release `NO_GO` regardless of partial green.
