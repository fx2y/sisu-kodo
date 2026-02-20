---
description: backend TypeScript architecture/style invariants
paths:
  - "src/**/*.ts"
---

# Backend TS Rules

- Import DAG only: `config -> {db,workflow,server,oc,sbx,lib}`; no reverse/cross leaks.
- Env ingress only `src/config.ts`; downstream uses typed config objects.
- WF/ST split is hard: `src/workflow/wf/**` deterministic control only; `src/workflow/steps/**` IO only.
- Repository layer maps SQL rows only; no orchestration/business branching there.
- Ban raw entropy/time outside wrappers: `Math.random|Date.now|new Date|process.hrtime|crypto.randomUUID`.
- Durable truth is DB rows; memory/logs are transient coordination only.
- Boundary contracts use single Ajv kernel (`src/contracts/**`) across ingress -> db-load -> step-out -> egress.
- Boundary typing fail-closed: no boundary `as` casts on request/response/error paths.
- Parse errors and schema/policy violations must return deterministic JSON `400`, never framework-default HTML/500.
- Primary API implementation uses Next App Router route handlers (`app/api/**/route.ts`) with same-origin behavior.
- Stable workflow API invariants are immutable: `workflowID=intentId`, fixed steps `CompileST|ApplyPatchST|DecideST|ExecuteST`.
- Start conflict path is idempotent success (no status downgrade/side effects).
- Keep modules branch-transparent and short; prefer explicit unions/results at boundaries.
- Naming/style: intent-first names (`assert*|parse*|toRow*|fromRow*`); comments only for invariants/tradeoffs.
