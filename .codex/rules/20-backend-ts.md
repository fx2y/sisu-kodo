---
description: backend TypeScript design/style invariants
paths:
  - "src/**/*.ts"
---

# Backend TS Rules

- Seams are strict: `config -> {db,workflow,oc,sbx,server} -> lib`; no reverse/cross imports.
- `process.env` reads are allowed only in `src/config.ts`; pass typed `AppConfig` downward.
- Raw entropy/time/uuid APIs are banned outside `src/lib/*` wrappers.
- Durable truth is DB; memory is transient coordination/dedupe only.
- Boundary contracts are centralized (`src/contracts/*` Ajv singleton + `assertValid`); no local Ajv.
- 4-gate lattice is required: Ingress -> DB-load -> Step-output -> Egress.
- Ban boundary `as` casts at ingress/egress/error paths; use narrowing helpers.
- Repos do SQL mapping only; validation/orchestration belong to service/workflow.
- APIs are deterministic: stable JSON fields, explicit status paths, explicit parse/validation failures.
- JSON parse errors must map `SyntaxError -> 400` (never generic `500`).
- Prefer pure functions/small modules; classes only for lifecycle/state owners.
- Exports must be explicit/typed; no implicit `any` passthrough. No bundlers in `src/`.
