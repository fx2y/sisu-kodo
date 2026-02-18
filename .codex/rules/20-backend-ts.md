---
description: backend TypeScript architecture/style invariants
paths:
  - "src/**/*.ts"
---

# Backend TS Rules

- Layering is hard law: `config -> {db,workflow,server,oc,sbx,lib}` only; no reverse/cross imports.
- `process.env` reads only in `src/config.ts`; downstream gets typed config objects.
- Workflow split is strict: `src/workflow/wf/**` deterministic control-only, `src/workflow/steps/**` IO-only.
- Repo layer does SQL mapping only; no orchestration, validation policy, or branching business logic.
- Ban raw entropy/time outside wrappers in `src/lib/**`: `Math.random|Date.now|new Date|process.hrtime|crypto.randomUUID`.
- Durable state is DB rows; in-memory state is transient coordination only.
- Contracts are centralized: Ajv singleton + validators from `src/contracts/**`; no local Ajv instances.
- Boundary lattice is mandatory: ingress -> db-load -> step-output -> egress.
- Boundary typing is fail-closed: no raw boundary `as` casts on ingress/egress/error paths; use parser/assert/narrow helpers.
- API behavior is deterministic JSON-only: stable fields, explicit status envelopes, deterministic `400` for JSON `SyntaxError` + schema violations.
- Stable workflow contracts are API, not implementation detail: `workflowID=intentId`; step IDs fixed (`CompileST|ApplyPatchST|DecideST|ExecuteST`).
- Reject silent fallback execution defaults (example: missing command => validation failure, not substitute command).

## Style Stance

- Prefer pure functions and data-in/data-out modules.
- Prefer explicit unions/Result-like returns at boundaries over implicit exception flow.
- Keep functions short enough to scan; split when control-flow branches hide invariants.
- Comments explain invariants/why, never narrate obvious syntax.
- Names must be semantic and monotonic across layers (`assert*`, `parse*`, `toRow*`, `fromRow*`).
