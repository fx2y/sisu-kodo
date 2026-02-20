# ADR 006: Durable UI + OTLP + Release Mastery

**Status:** Decided (Cycle 6)  
**Context:** Ship spec-0/06 "Durable UI" surface. 1-page Chat->Run->Timeline->Artifacts. Proving restart-resume on same `workflowID`.  
**North:** Determinism / Fail-Closed / SQL-Oracle First. UI is a thin, ephemeral projection of durable Postgres truth.

## 1. Core Invariants (Non-Negotiable)

- **Identity:** `workflowID == intentId`. Identity preserved across restarts/kills.
- **Topology:** Next.js App Router `/api` routes (singleton service accessor) replaces custom HTTP shim for UI.
- **Fail-Closed:** Single AJV kernel at `src/contracts`. `additionalProperties: false`. Malformed JSON/Policy = 400 + Zero Writes.
- **Queue Law:** `queuePartitionKey` mandatory for parent intents when `SBX_QUEUE_PARTITION=true`.
- **Step Projection:** Merge DBOS `listWorkflowSteps` (real-time) with `app.run_steps` (durable). Stable sort by `startedAt` then `stepID`.
- **Artifact Law:** Every step emits >= 1 artifact. Sentinel `kind: none` at `idx: 999` for zero-domain-output steps.
- **X-Once:** `app.mock_receipts` + `app.sbx_runs` SQL-oracle proof. `duplicates == 0` is the only release signal.

## 2. Diagram: Durable Timeline Projection

```text
[DBOS Runtime] (listWorkflowSteps) ---.
                                      |--> [getStepRowsService] --> [StepRowV1[]] --> [UI Timeline]
[Postgres app.run_steps] -------------|      (Stable Sort)          (Poll 1Hz)        (Artifact Sheets)
[Postgres app.artifacts] -------------^
```

## 3. Snippet: HITL + nextAction

```typescript
// src/contracts/run-view.schema.ts
export type RunHeader = {
  workflowID: string;
  status: 'PENDING' | 'SUCCESS' | 'ERROR' | ...;
  nextAction?: 'APPROVE_PLAN' | 'REPAIR'; // Drives UI Banners
  traceId?: string;
};
```

## 4. Walkthrough: Restart-Resume Proof

1. `pnpm dev:ui` (OC_MODE=replay, SBX_MODE=mock).
2. Start Run via Chat (WID=X).
3. `kill -9` worker process during `DecideST`.
4. Restart worker. Timeline for WID=X resumes at `DecideST` attempt 2.
5. SQL Oracle: `SELECT count(*) FROM app.run_steps WHERE run_id=(...) AND step_id='DecideST'` == 2.

## 5. Release Decision (GO/NO-GO)

- **GO:** `quick/check/full` green AND forced chaos/fanout soaks green AND `dup_receipts=0`.
- **ROLLBACK:** Any duplicate side-effect for same `(runId, stepId, taskKey, attempt)`.
