# Boundary Lattice (M05, L86)

Fail-closed contract enforcement at every layer.

## Lattice Flow

```
INGRESS (Shim) -> DB LOAD (Worker) -> STEP OUTPUT (Task) -> EGRESS (Server)
```

## Schema Enforcement

- **Ingress**: `assertIntentRequest` (strict Ajv)
- **DB Load**: `repo.getIntent` (no `as` casts, manual property mapping or strict row assert)
- **Step Output**: `assertStepOutput` (fixed `kind` allowlist)
- **Egress**: `assertRunView` (filtered fields)

## Forbidden Pattern

```typescript
// BAD: as-cast on ingress
const body = req.body as IntentRequest;

// GOOD: parse + narrow
const body = assertIntentRequest(req.body);
```
