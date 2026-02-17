# ADR 001: DBOS Contract Gates & Policy Enforcement

## Status

Accepted (Cycle C3)

## Context

We need deterministic and durable workflows that fail-fast at every boundary.
The system integrates DBOS for durability and Ajv for contract validation.

## Decision

Enforce a 4-gate validation lattice for all intent/run workflows:

1. **Ingress Gate**: `HTTP POST` payloads are validated before reaching the Service layer.
2. **DB-load Gate**: Records fetched from the DB are validated before workflow logic starts.
3. **Step-output Gate**: Side-effect results (from OC/SBX) are validated before persisting to DB.
4. **Egress Gate**: `RunView` projections are validated before returning to the caller.

Policy enforcement:

- **No Bundlers**: Direct `tsc/node` or `tsx` usage to maintain traceability.
- **No DBOS System Intrusion**: App tables must reside outside the `dbos` schema.
- **Ajv Gate Density**: Minimum threshold of validation calls to prevent "silent casts".

## Operational Playbook

### Debugging "ValidationError"

If a request fails with 400 and `ValidationError`:

1. Check the `details` field in the JSON response.
2. Verify the schema in `src/contracts/*.schema.ts`.
3. If the DB-load gate fails, it means inconsistent data was persisted (check migrations).

### Dealing with "Workflow not found" (CLI)

If `mise run dbos:workflow:list` shows nothing:

1. Ensure `DBOS_SYSTEM_DATABASE_URL` is correctly configured in `mise.toml`.
2. Verify the app was launched via `node dist/main.js` (not `tsx` for production-like runs).
3. Ensure `DBOS.launch()` was called in `main.ts`.

### Running Soak Tests

To detect flakes (e.g. non-deterministic IDs or timestamps):

```sh
mise run -f wf:crashdemo:soak
mise run -f test:unit:soak
```

These bypass all caches to force execution.

## Implications

- All data types must be mirrored as JSON schemas.
- Manual casting (`as`) at boundaries is strictly forbidden by policy.
