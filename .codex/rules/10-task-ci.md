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

- `mise` is sole orchestrator; pnpm/npm scripts are mirrors, never truth.
- DAG must be explicit (`depends`) and monotonic:
  `quick=fmt+lint+type+unit+policy`, `check=quick+integration+wf`, `full=check+e2e+soak+live-smokes`.
- Every `run` task declares `sources`; expensive tasks declare `outputs` or `outputs.auto=true`.
- Always-run exceptions are narrow and explicit (reset/e2e lanes only).
- Resets are uncached and deterministic; serialize shared-resource lanes when in doubt.
- Task commands must honor env port overrides (`PORT`, peers, admin ports, daemon ports).
- CI entrypoint is fixed: `mise install && mise run ci:*`; no bespoke shell choreography.
- Deterministic env baseline required: Node24, postgres:18.2, `TZ/LANG/LC_ALL/NODE_ENV/CI`, `MISE_TASK_OUTPUT=prefix`.
- Policy gates must self-test with known-bad (fail) and known-good (pass) fixtures before real scan.
- Golden/baseline drift fails closed unless explicit refresh/bootstrap flag is set.
- Repeat/soak evidence is admissible only via forced rerun (`mise run -f ...`).
- Release evidence must include reset, happy path, break path, recovery/HITL, OC/SBX smokes, and truthful `mise tasks deps check`.
