---
description: backend TypeScript architecture/boundary/style laws
paths:
  - "src/**/*.ts"
---

# Backend TS Rules

- Preserve import DAG + seams from `AGENTS.md`; no cross-layer leakage.
- Route/adapter bodies fixed-shape: `parse/assert -> service -> repo/workflow -> asserted egress`.
- Contracts owned by `src/contracts/**`; adapter-local ad-hoc schemas forbidden.
- Next and shim/manual adapters share services/asserts + exact lattice parity (`400/404/409/500`).
- `/api/run` canonical ingress; legacy routes explicit, env-gated, deprecation-labeled.
- Boundary typing fail-closed: no unchecked casts on req/resp/error paths.
- `process.env` access only in `src/config.ts`.
- Deterministic paths ban raw entropy/time (`Math.random|Date.now|new Date|hrtime|randomUUID`).
- Workflow time uses DBOS seam only; no wall clock in replay-compared outputs.
- Exactly-once conflict handling = semantic load/compare (`409` drift), never boolean-only checks.
- Expected conflict/state drift paths use typed domain errors, not generic throws.
- Status merges/projections monotonic+explicit; terminal->nonterminal downgrade illegal.
- Queue/intent enqueue options composed only via canonical seam (`intent-enqueue`), never handcrafted per callsite.
- Style law: pure funcs, total parsers, exhaustive switches, Result/union boundaries, intent-first names, invariant-only comments.
