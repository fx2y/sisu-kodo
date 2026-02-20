---
description: backend TypeScript architecture/style invariants
paths:
  - "src/**/*.ts"
---

# Backend TS Rules

- Import DAG only: `config -> {db,workflow,server,oc,sbx,lib}`; no reverse/cross leaks.
- Env ingress only `src/config.ts`; downstream uses typed config objects.
- WF/ST split is hard: `src/workflow/wf/**` deterministic control only; `src/workflow/steps/**` IO only.
- Repos map SQL rows only; no orchestration/business branching in `src/db/**`.
- Durable truth is DB rows; memory/logs are coordination hints only.
- Boundary contracts use single Ajv kernel (`src/contracts/**`) through ingress -> db-load -> step-out -> egress.
- Boundary typing fail-closed: no boundary `as` casts on request/response/error paths.
- JSON parse/schema/policy errors must return deterministic JSON `400`, never framework-default HTML/500.
- Primary HTTP surface is Next App Router (`app/api/**/route.ts`); compat handlers must preserve identical semantics.
- `/api/ops/wf*` surface must remain exact-six routes; changes require explicit spec+policy updates.
- Ban raw entropy/time outside wrappers: `Math.random|Date.now|new Date|process.hrtime|crypto.randomUUID`.
- For ESM SDKs in CJS paths, use explicit `dynamic import()` boundary wrappers; never implicit interop guesses.
- Normalize mixed external payload types (`string|Date|number|null`) before boundary egress; required fields fail fast.
- Keep modules short/branch-transparent; prefer explicit Result/union returns over thrown control flow.
- Style defaults: intent-first names (`assert*|parse*|toRow*|fromRow*`), exhaustive switches, invariant-only comments.
