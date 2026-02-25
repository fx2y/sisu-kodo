---
description: backend TypeScript architecture/boundary/style laws
paths:
  - "src/**/*.ts"
---

# Backend TS Rules

- Preserve import DAG + seams from `AGENTS.md`; no cross-layer leakage.
- Route/adapter bodies fixed shape: `parse/assert -> service -> repo/workflow -> asserted egress`.
- Contracts owned by `src/contracts/**`; adapter-local ad-hoc schemas forbidden.
- Next and shim/manual adapters share services/asserts + exact lattice parity (`400/404/409/500`).
- `/api/run` canonical ingress; legacy routes explicit, env-gated, deprecation-labeled.
- Boundary typing fail-closed: no unchecked casts on req/resp/error paths.
- `process.env` access only in `src/config.ts`.
- Deterministic paths ban raw entropy/time (`Math.random|Date.now|new Date|hrtime|randomUUID`).
- Workflow time uses DBOS seam only; no wall clock in replay-compared outputs.
- Proof/signoff generation must not fabricate timestamps (`nowMs` fallback forbidden).
- Operator-visible claim objects must carry provenance (`source`,`rawRef`, optional `evidenceRefs`,`sourceTs`).
- Missing mandatory evidence for GO claims must deterministically downgrade to `NO_GO`.
- Exactly-once conflict handling = semantic load/compare (`409` drift), never boolean-only checks.
- Expected conflict/state drift paths use typed domain errors, not generic throws.
- Not-found/error routing must use typed error classes/codes, never substring message matching.
- Split DB queries must be two-step (`appPool -> sysPool`); no cross-db joins; DBOS key is `workflow_uuid`.
- `origin` enums/types are sourced from shared contract exports; local duplicate enums forbidden.
- Status merges/projections monotonic+explicit; terminal->nonterminal downgrade illegal.
- Queue/intent enqueue options composed only via canonical seam (`intent-enqueue`), never handcrafted per callsite.
- Style law: pure funcs, total parsers, exhaustive switches, Result/union boundaries, intent-first names, invariant-only comments.
