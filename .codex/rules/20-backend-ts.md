---
description: backend TypeScript architecture/style invariants
paths:
  - "src/**/*.ts"
---

# Backend TS Rules

- Layer law: `config -> {db,workflow,server,oc,sbx,lib}` only; no reverse/cross imports.
- Env ingress only in `src/config.ts`; downstream receives typed config.
- WF split: `src/workflow/wf/**` deterministic control, `src/workflow/steps/**` IO; repo layer is SQL mapping only.
- Ban raw entropy/time outside wrappers: `Math.random|Date.now|new Date|process.hrtime|crypto.randomUUID`.
- Durable truth is DB rows; memory is transient coordination only.
- Contract boundary: one Ajv kernel in `src/contracts/**`; boundary lattice ingress -> db-load -> step-out -> egress.
- Boundary typing is fail-closed: no boundary `as` casts on ingress/egress/error paths.
- API must stay deterministic JSON envelope with stable fields/status; malformed JSON/schema => deterministic `400`.
- Stable workflow API is fixed: `workflowID=intentId`, steps `CompileST|ApplyPatchST|DecideST|ExecuteST`.
- Execution defaults must never silently fallback (missing command/config => explicit error).
- Style law: pure data-in/data-out modules, explicit unions/Results at boundaries, short branch-transparent functions, comments for invariants (not syntax), intent names (`assert*|parse*|toRow*|fromRow*`).
