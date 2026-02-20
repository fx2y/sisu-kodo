# Topology & Queue Law (Cycle 6)

## Split-Topology Enforcement
- **Worker Process:** `DBOS_WORKER=true`. Imports/Executes WFs. No HTTP ingress.
- **Shim/API Process:** `DBOS_SHIM=true`. `enqueueWorkflow` + `retrieveWorkflow`. No internal WF imports (logic isolation).
- **Identity Consistency:** `DBOS__APPVERSION` must match (e.g., `v1`). Enqueueing `v1` on `v2` worker = 400.

## Queue Partitioning Rule
```typescript
// src/workflow/queue-policy.ts (SBX_QUEUE_PARTITION=true)
if (queueName === 'intentQ' && !queuePartitionKey) {
  throw new PolicyViolation('Parent intents require partition key end-to-end.');
}
```
- **Source:** `ChatInput` sends `ui-default`. Custom tenants send `tenant-X`.
- **Propagation:** `intentQ (parent) -> sbxQ (child)`. Child key = `parent.queuePartitionKey`.

## Port Strategy
- `3000`: Next.js UI + App Router `/api` (Production Surface).
- `3001`: External API Shim (Legacy/Integration Surface).
- `4096`: OC Daemon (Mock/Live).
- `5432`: Postgres (Single Source of Truth).
