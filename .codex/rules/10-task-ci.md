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

- `mise` is sole orchestrator; package scripts are mirrors, never source of truth.
- DAG must be explicit/monotonic via `depends`:
- `quick = fmt+lint+type+unit+policy`
- `check = quick+integration+wf+contract smokes`
- `full = check+e2e+release smokes`
- Every run task declares `sources`; expensive tasks declare `outputs`/`outputs.auto=true`.
- Always-run tasks stay narrow/explicit (reset/e2e/soak only).
- Reset order is deterministic: `db:sys:reset` before `db:reset` whenever both are required.
- Task commands must honor env port overrides (`PORT`, peers, admin/daemon ports).
- CI entrypoint is fixed: `mise install && mise run ci:*`; no bespoke shell choreography.
- Deterministic baseline required: Node24, postgres:18.2, `TZ/LANG/LC_ALL/NODE_ENV/CI`, `MISE_TASK_OUTPUT=prefix`.
- Policy gates must be executable semantic probes, not grep-only scans.
- Every policy gate self-tests with known-bad(fail) and known-good(pass) fixtures before real scan.
- Golden/baseline drift fails closed unless explicit refresh flag is provided.
- Soak/repeat evidence is admissible only via forced rerun (`mise run -f ...`).
- OTLP smoke in `check` must hard-fail when required (`OTLP_REQUIRED=1`); no `|| true` masking.
- Release evidence must include reset path, happy path, break path, recovery/HITL, OC/SBX smokes, and truthful `mise tasks deps check`.
