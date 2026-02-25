# Sisu-Kodo Ops Field Manual (06-07)

## 0. Runtime Doctrine
*   **Truth Source:** SQL Oracle (`app.*`, `dbos.*`). Logs are secondary.
*   **Identity Law:** `workflowID` == `intentId`. Idempotent start.
*   **State Latice:** `400` (Policy/Schema), `404` (Missing), `409` (Conflict), `500` (Infra).
*   **Topology:** Split Worker/Shim. Parity via `DBOS__APPVERSION`.

## 1. Environment & Baseline
Configure these for live/demo environments.

```bash
# Core
export PORT=3000 ADMIN_PORT=3001
export OC_MODE=replay SBX_MODE=mock
export SBX_QUEUE_PARTITION=true # Enforce partition law

# Observability (Bet A)
export DBOS_ENABLE_OTLP=true
export OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=http://localhost:4318/v1/traces
export TRACE_BASE_URL='http://localhost:16686/trace/{traceId}'

# Setup
mise run db:up && mise run db:reset && mise run db:sys:reset
pnpm dev # Starts UI + API + Worker
```

---

## 2. PO Showcase: The Golden Path
**Scenario:** Start intent, approve plan, verify completion.

1.  **Create Intent:**
    ```bash
    INTENT=$(curl -s -X POST http://localhost:3000/api/intents -d '{"goal":"demo","inputs":{},"constraints":{}}' | jq -r .intentId)
    ```
2.  **Start Run (Strict):**
    ```bash
    RUN=$(curl -s -X POST http://localhost:3000/api/runs -d "{"intentId":"$INTENT","recipeName":"compile-default","queuePartitionKey":"ui-default"}" | jq -r .workflowID)
    ```
3.  **UI Verification:** Open `http://localhost:3000/?wid=$RUN`.
    *   Watch **TimelineLive** (Polling 1s).
    *   **Action:** Click "Approve Plan" when `nextAction: APPROVE_PLAN` appears.
4.  **Artifact Drill:** Open **ArtifactSheet** on `CompileST`. Verify `kind: artifact_index`.

---

## 3. QA Track: Durability & Fail-Closed
**Scenario:** Prove restart-resume and zero-write policy.

### Walkthrough A: Kill/Restart Survival
1.  Start run `$RUN`. Wait for `ExecuteST` (Pending).
2.  **Kill Worker:** `pkill -f 'src/worker/main.ts'`.
3.  **Observe UI:** Timeline shows `PENDING`/Stale.
4.  **Restart:** `pnpm dev`.
5.  **Result:** UI resumes on same `$RUN`. SQL check:
    ```sql
    SELECT seen_count FROM app.mock_receipts WHERE run_id = '$RUN'; -- Must be 1 (Exactly-Once)
    ```

### Walkthrough B: Policy Rejection (Zero-Write)
1.  Attempt start without `queuePartitionKey` in strict mode:
    ```bash
    curl -i -X POST http://localhost:3000/api/runs -d "{"intentId":"$INTENT"}"
    # Expect 400. SQL: SELECT count(*) FROM app.runs; -- Count must not increase.
    ```

---

## 4. FDE Track: Control Plane (Exact 6)
**Scenario:** Manual intervention on stalled/failed runs.

### Walkthrough C: Cancel -> Resume Boundary
1.  Target a slow run `$WID`.
2.  **Cancel:**
    ```bash
    curl -X POST http://localhost:3000/api/ops/wf/$WID/cancel -d '{"actor":"fde","reason":"stalled"}'
    ```
3.  **Audit:** `SELECT inline->>'op' FROM app.artifacts WHERE step_id='OPS' AND run_id='$WID';`
4.  **Resume:** `POST /api/ops/wf/$WID/resume`. Resumes from last checkpoint.

### Walkthrough D: Fork After Fix (Step Cache)
1.  Run fails at `ExecuteST` (idx 3).
2.  **Fork:**
    ```bash
    curl -X POST http://localhost:3000/api/ops/wf/$WID/fork -d '{"stepN":2,"actor":"fde","reason":"patch-applied"}'
    ```
3.  **Result:** New `workflowID` generated. `CompileST` and `ApplyPatchST` are **cached** (reused from $WID).

---

## 5. Architect Track: Time & Telemetry
**Scenario:** Durable timers and OTLP auditing.

### Walkthrough E: Durable Sleep
1.  Trigger sleep: `POST /api/ops/sleep?wf=sleep_1&sleep=60000`.
2.  Kill worker immediately. Wait 30s. Restart worker.
3.  **Result:** Workflow wakes up precisely 60s after original start. Oracle:
    ```sql
    SELECT step_id FROM app.artifacts WHERE run_id='sleep_1'; -- 'sleep-after-sleep' appears post-restart.
    ```

### Walkthrough F: OTLP Audit
1.  Inspect trace link in UI or API response.
2.  Verify span attributes in Collector:
    *   `workflowID`: Intent identity.
    *   `step.functionID`: `CompileST`, etc.
    *   `attempt`: Current retry index.

---

## 6. Ops Kit & Oracles
Use these for rapid triage.

*   **Batch List Failed:** `mise run ops:list-failed`
*   **SQL Inbox:** `mise run ops:sql:inbox` (Failed in 24h).
*   **Queue Depth:** `SELECT * FROM app.v_ops_queue_depth;` (System SoT).

### Final Signoff Check
*   `mise run quick`: All policy/contracts green.
*   `mise run -f wf:intent:chaos:soak`: Zero duplicate side-effects.
*   `app.artifacts` contains `kind: none` for zero-output steps.
