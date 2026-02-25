---
description: task graph, policy probes, CI proof-floor invariants
paths:
  - "mise.toml"
  - "package.json"
  - ".github/workflows/*.yml"
  - "scripts/**/*.sh"
  - "scripts/**/*.ts"
  - "spec-0/**/*.jsonl"
---

# Task + CI Rules

- `mise` is orchestration SoT; package scripts mirror only.
- DAG must be explicit/monotonic: `quick < check < full` via `depends` only.
- Lane truth: `quick=fmt+lint+type+unit+policy`; `check=quick+integration/workflow/contract`; `full=check+e2e+release`.
- `tasks.policy` is always-run aggregate (`policy-run-all`); never source-cache skip.
- `sources` must be truthful; expensive tasks declare `outputs` or `outputs.auto=true`.
- Policy gates must be semantic executable probes (AST/API/SQL/contracts/render), never grep-only scans.
- Every policy gate self-tests `known-bad=>fail` and `known-good=>pass` before repo scan.
- Claim-integrity gate: no `DONE|GO|CLOSED` if referenced proof file/cmd is absent/failing in current tree.
- Scenario-matrix claims require executable matrix test artifact and report rows with `scenarioId+proofRefs[]`.
- Evidence/provenance checks must validate semantics (`source` taxonomy + `rawRef/evidenceRefs` linkage), not string presence.
- CI entrypoint fixed: `mise install && mise run ci:*`; reset order fixed: `db:sys:reset` then `db:reset`.
- Baseline env pins: `Node24`, `postgres:18.2`, deterministic `TZ/LANG/LC_ALL/NODE_ENV/CI`, `MISE_TASK_OUTPUT=prefix`.
- Golden drift fails closed unless explicit refresh flag.
- Repeats/soaks admissible only via forced rerun `mise run -f ...`.
- Required-fidelity smokes fail hard when enabled; no masking (`|| true`).
- Any red in `quick|check|full` => release `NO_GO`.
