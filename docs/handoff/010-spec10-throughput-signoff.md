# Handoff: Spec10 Throughput & Through-Put Signoff

Cycle 7 is **GREEN**. The control-plane throughput architecture is signed off for production-parity.

## Core Topology: Split-Brain

- **API (Shim)**: `WORKFLOW_RUNTIME_MODE=api-shim`. Runs in Next process. **ENQUEUE/READ ONLY**. `DBOS.launch` is strictly forbidden (Policy: `api-no-dbos-launch`).
- **Worker**: `WORKFLOW_RUNTIME_MODE=inproc-worker`. Executes workflows and steps. Owners of `intentQ`, `sbxQ`, etc.
- **Shared Seam**: `src/api-shim/dbos-client.ts` (DBOSClientWorkflowEngine) provides a unified `WorkflowService` interface regardless of topology.

## Durable Laws (Mandatory)

### 1. Queue Law

- **Parent**: `intentQ` (IntentWorkflow).
- **Child**: `sbxQ` (ExecuteTask/ExecuteST).
- **Metadata**: `compileQ`, `controlQ`.
- **Lanes**: `interactive` (priority=1) vs `batch` (priority=1000). Mapped via `src/workflow/intent-enqueue.ts`.

### 2. Enqueue Edge Law

- **Requirement**: Every enqueue must carry `deduplicationID` **OR** `priority`.
- **Constraint**: DBOS 4.9.11 forbids dedupe on partitioned queues. `intent-enqueue` automatically drops dedupe if `intentQ` is partitioned to preserve fairness over idempotency at that layer (idempotency is handled by the `ih_<hash>` workflow ID).

### 3. Identity Law

- **Intent**: `workflowID = intentId = ih_<sha256(canonical(intent))>`.
- **Run**: `app.runs.id = sha256(workflowID).slice(0,32)`.
- **Fanout**: `taskKey = sha256(canonical{intentId,runId,stepId,req})`.

### 4. Budget Law

- **Ingress**: `RunStartRequest` includes `RunBudget`. Schema: `additionalProperties:false`.
- **Runtime**: `src/workflow/wf/run-intent.wf.ts` invokes `BudgetGuard` at fanout and completion boundaries.
- **Evidence**: Violation => Deterministic `BUDGET` artifact + `retries_exceeded` status. No wall-clock in deterministic paths (uses `steps.getTimestamp()`).

### 5. SBX Template Law

- **Registry**: `app.sbx_templates` keyed by `(recipe_id, recipe_v, deps_hash)`.
- **Resolution**: `ExecuteStep` resolves template before fanout. Deps-hash drift => new template ID rotation.

## Walkthrough: Canonical Ingress

To run a production-grade intent:

1. **Find Recipe**: `GET /api/recipes` -> `stable_ref=id@v`.
2. **Start Run**:

```bash
# Ingress enforces Edge Law + Budget ABI
curl -X POST $BASE/api/run -d '{
  "recipeRef": {"id": "...", "v": "..."},
  "formData": {"goal": "throughput-test"},
  "opts": {
    "lane": "interactive",
    "queuePartitionKey": "tenant-A",
    "budget": {
      "maxFanout": 10,
      "maxSBXMinutes": 5,
      "maxArtifactsMB": 100,
      "maxRetriesPerStep": 1,
      "maxWallClockMs": 60000
    }
  }
}'
```

## Walkthrough: Batch Ops

Use `scripts/ops/cli.ts` (wrapped by `scripts/ops/*.sh`) for high-volume control:

```bash
# Cancel interactive backlog for a tenant
PORT=3001 scripts/ops/cancel_batch.sh --tenant tenant-A --lane interactive --reason "load shedding"
```

_Audit Invariant_: Every batch op persists an `OPS` artifact with `actor` + `reason`.

## Proof Floor (The Ground Truth)

**Signoff is binary.** If any gate is red, it's a **NO_GO**.

1. `mise run quick`: Fmt, Lint, Type, Unit, Policy.
2. `mise run check`: Integration, Workflow, Contract.
3. `mise run full`: E2E, Load (k6), Signoff.
4. `mise run policy`: Executes semantic probes + self-test fixtures.

### Critical SQL Oracles

- **X-Once**: `select count(*) from app.run_steps group by run_id,step_id,attempt having count(*)>1` == 0.
- **Topology**: `select queue_name,queue_partition_key from dbos.workflow_status` (Check parent/child split).
- **Budgets**: `select * from app.artifacts where step_id='BUDGET'`.

## Known Debt / Warning

- **DBOS Quirks**: Do not use `idempotencyKey` in `DBOS.send` within workflows (version 4.9.11). Use the `src/workflow/dbos/intentWorkflow.ts` event-ledger pattern.
- **Port Isolation**: Local proofs MUST isolate `PORT/ADMIN_PORT/OC_SERVER_PORT` to avoid socket-hang GP10 regressions.
- **Migration Sync**: Ensure migration `027` (templates) and `028` (budgets) are applied.
