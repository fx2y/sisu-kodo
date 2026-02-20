# Ops Control Mastery (Cycle 7 Handoff)

**Status:** Cycle 7 Released (2026-02-20).  
**Context:** Durable Ops + Control Plane + Time Primitives.  
**Law:** `Contract > Determinism/Fail-Closed > SQL-Oracle Exactly-Once > Ergonomics`.

## 1. The Three Planes
Maintain hard isolation between these planes:
- **Data-Plane:** `/api/intents` + `/api/runs`. High-volume, product-facing.
- **Control-Plane:** `/api/ops/wf*` (Exact 6 routes). Operator-facing, strict auth/audit.
- **Proof-Plane:** `mise` tasks + SQL views (`app.v_ops_*`). Deterministic evidence.

## 2. Control Plane: The Exact Six
Bypassing these schemas or adding a 7th route violates the C7 contract.
- **Routes:** `GET /`, `GET /:id`, `GET /:id/steps`, `POST /:id/cancel`, `POST /:id/resume`, `POST /:id/fork`.
- **Contracts:** `src/contracts/ops/*.schema.ts`. `additionalProperties: false` is non-negotiable.
- **Error Lattice:** `400` (Validation), `404` (Missing), `409` (Conflict), `500` (Bug).

### Walkthrough: The "Conflict" Guard
```bash
# Cancel only allowed if PENDING|ENQUEUED
curl -X POST /api/ops/wf/$ID/cancel -d '{"actor":"me","reason":"stop"}'
# Response: 202 Accepted OR 409 Conflict (e.g. if already SUCCESS)
```

## 3. Durable Semantics
Behavior is backed by DBOS checkpoints, not memory.
- **Cancel:** Stops at next step boundary. `s1:1` persists; `s2` never starts.
- **Resume:** Pick up from last mark using *same* `workflowID`. Exactly-once.
- **Fork:** New `workflowID`, reuses prior step results via `startStep`.
- **Fork Guard:** Reject `stepN > max(functionId)` with `409`. (Fix for G07.S0.03).

### Example: Fork-After-Fix Loop
1. Run fails at `ExecuteST` (Step 4). Status=ERROR, NextAction=REPAIR.
2. Operator fixes bug/config.
3. Operator calls `/fork` with `stepN=4`.
4. New Run starts; Step 1-3 results pulled from cache; Step 4 executes.

## 4. Operator Intent Audit (OPS Artifacts)
Every control action *must* leave a trace in `app.artifacts`.
- **Target:** `step_id='OPS'`, `idx=0`, `kind='json_diagnostic'`.
- **Payload:** `{op, actor, reason, targetWorkflowID, at, [forkedWorkflowID]}`.
- **Oracle:** `SELECT * FROM app.artifacts WHERE step_id='OPS'`.

## 5. Time Primitives
Ban `setTimeout`. Use durable primitives.
- **Durable Sleep:** `await DBOS.sleepms(2000)`. Survives worker crash.
- **Scheduled Tick:** `@DBOS.scheduled({ interval: '30s' })`. Uses `ExactlyOncePerInterval` (catch-up mode).
- **Rule:** Scheduled methods MUST also be `@DBOS.workflow`.

## 6. The Ops Kit (Scripts + SQL)
Zero coupling to app tables. Query `dbos.*` system tables via views.
- **CLI:** `mise run ops:list-failed`, `mise run ops:cancel-batch`, etc.
- **SQL Views:** `app.v_ops_failures_24h`, `app.v_ops_slow_steps`, `app.v_ops_queue_depth`.
- **Usage:** Use `scripts/db/psql-sys.sh` to query views (they live in System DB).

## 7. OTLP & Trace Connectivity
- **Endpoints:** `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`, `LOGS_ENDPOINT`.
- **Mandatory Attrs:** `workflowID`, `step.name`, `appVersion`.
- **Gate:** `mise run otlp:smoke`. Fails if receiver is down or wiring is broken.

## 8. The 10-Minute Triage (FDE Manual)
If a run hangs:
1. `curl /healthz` (Is worker alive?)
2. `curl /api/ops/wf/$ID` (Status in DBOS?)
3. `mise run ops:sql:inbox` (Check system-level backlogs)
4. `SELECT * FROM app.run_steps WHERE run_id=$ID` (Check local marks)
5. Only then check logs.

## 9. Proof Floor (Release Gate)
`mise run quick` -> `check` -> `full`.
- **Quick:** Unit + Policy (Retry allowlist, Route counts).
- **Check:** Integration (Cancel/Resume/Fork, Time, Ops-Kit).
- **Full:** E2E + Forced Soaks (`-f wf:intent:chaos:soak`).

**Crucial:** `db:sys:reset` MUST run before `db:reset` to preserve ops views.
