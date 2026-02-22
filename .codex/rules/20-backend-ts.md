---
description: backend TypeScript architecture/style invariants
paths:
  - "src/**/*.ts"
---

# Backend TS Rules

- Import DAG only: `config -> {db,workflow,server,oc,sbx,lib}`; no reverse/cross leaks.
- Env ingress only `src/config.ts`; downstream consumes typed config, never raw `process.env`.
- WF/ST/repo split is hard: WF deterministic control, ST IO, repos SQL mapping only.
- Durable truth is SQL rows; memory/logs are hints.
- Contracts use one Ajv kernel (`src/contracts/**`) across `ingress->db-load->step-out->egress`.
- Boundary typing fail-closed: no boundary `as`; parse/assert every external input before use.
- JSON/schema/policy failures return deterministic JSON `400`, never framework default HTML/500.
- Next App Router is primary; manual/shim handlers must preserve behavior and error lattice parity.
- `/api/ops/wf*` remains exact-six routes unless spec+policy change lands first.
- Ban raw entropy/time outside wrappers: `Math.random|Date.now|new Date|process.hrtime|crypto.randomUUID`.
- Dedupe APIs are semantic, not boolean: conflict path must detect payload/topic drift and emit `409`.
- Status merges/projections must be monotonic and explicit (no hidden downgrade paths).
- ESM SDK use inside CJS paths requires explicit `dynamic import()` wrappers.
- Module style: short, branch-transparent, Result/union returns, exhaustive switches, intent-first names, invariant-only comments.
