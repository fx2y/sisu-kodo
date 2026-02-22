---
description: backend TypeScript boundary/style invariants
paths:
  - "src/**/*.ts"
---

# Backend TS Rules

- Respect import DAG + seam split from `AGENTS.md`; no cross-layer leaks.
- Route/adapter bodies stay thin: `parse/assert -> service -> repo/workflow -> asserted egress`.
- Contract assertions come only from `src/contracts/**`; adapter-local schemas are forbidden.
- App Router and shim/manual adapters must share asserts/services and keep lattice parity (`400/404/409/500`).
- `/api/run` is canonical ingress; legacy compat handlers stay explicit/gated/deprecation-labeled.
- Boundary typing fail-closed: no unchecked boundary casts; parse/assert all external data.
- No raw `process.env` reads/writes outside `src/config.ts`.
- No raw entropy/time in deterministic code paths; workflow time comes from workflow clock seam.
- Exactly-once conflict handling is semantic load/compare (`409` on drift), never boolean-only.
- Status projections/merges must be monotonic and explicit; no hidden downgrade paths.
- Workflow-context message send must obey DBOS workflow API constraints; idempotency proof remains SQL-ledger-based.
- Module style: small/pure/branch-transparent, Result/union returns, exhaustive switches, intent-first naming, invariant-only comments.
