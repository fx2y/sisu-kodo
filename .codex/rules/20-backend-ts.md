---
description: backend TypeScript design/style invariants
paths:
  - "src/**/*.ts"
---

# Backend TS Rules

- Keep seams clean: `config -> db/workflow/oc/sbx/server`; avoid cross-layer shortcuts.
- Read `process.env` only in `src/config.ts` (or equivalent config module). Pass typed config downward.
- Non-deterministic primitives are wrapper-owned (`src/lib/time.ts`, `src/lib/rng.ts`); callers never use raw APIs.
- Durable business state goes to DB; process memory may only cache/coordinate transient execution.
- Idempotency first: side effects guarded by keys/constraints + conflict-safe writes.
- API boundaries are schema-validated (`assert*` guards); reject unknown shape early.
- JSON API behavior must be deterministic: stable keys, explicit status codes, explicit missing-param failures.
- Prefer pure functions + small modules; use classes only when owning lifecycle/state.
- Exported surfaces require explicit types; avoid hidden widening via implicit `any`/`unknown` passthrough.
- Errors: fail fast with high-signal messages containing the violated invariant, not generic text.
