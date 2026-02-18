---
description: backend TypeScript architecture/style invariants
paths:
  - "src/**/*.ts"
---

# Backend TS Rules

- Layering is strict: `config -> {db,workflow,server,oc,sbx,lib}` only; no reverse/cross imports.
- `process.env` reads only in `src/config.ts`; pass typed config downward.
- Workflow split is mandatory: `src/workflow/wf/**` control-only deterministic; `src/workflow/steps/**` owns IO.
- Ban raw entropy/time APIs outside wrappers (`src/lib/**`): `Math.random|Date.now|new Date|process.hrtime|crypto.randomUUID`.
- Durable state lives in DB; memory is transient coordination only.
- Contracts are centralized: Ajv singleton + validators from `src/contracts/**`; no local Ajv.
- Required boundary lattice: ingress -> db-load -> step-output -> egress.
- Boundary type-safety is fail-closed: no raw `as` at ingress/egress/error; use parser/narrowing helpers.
- Repository layer does SQL mapping only; no orchestration/validation/domain branching.
- API behavior must be deterministic JSON: stable fields, explicit status envelopes, explicit `400` for JSON `SyntaxError` and schema violations.
- Stable workflow contracts are non-negotiable: `workflowID=intentId`, fixed step IDs (`CompileST|ApplyPatchST|DecideST|ExecuteST`).
- Prefer pure functions and small modules; classes only for lifecycle/state ownership.
