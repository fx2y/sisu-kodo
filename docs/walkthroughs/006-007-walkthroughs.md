# Sisu-Kodo Mastery: 006 (UI) & 007 (Ops)

## I. Kernel Constitution
- **Identity:** `workflowID == intentId`. Idempotent start.
- **SSOT:** SQL (`app.*` + `dbos.*`) > Logs.
- **Boundary:** Single Ajv kernel. `400` Malformed/Policy, `404` Missing, `409` Conflict, `500` Infra.
- **Topology:** Split `worker` (exec) vs `api-shim` (enqueue/read). `DBOS__APPVERSION` parity mandatory.

---

## II. 006: Durable UI & Artifacts
**Goal:** 1-page Chat->Timeline proving restart-resume on same `wid`.

### 1. The Execution Loop
1. **Ingress:** `ChatInput` -> `POST /api/runs`.
   - Payload: `{ intentId, recipeName, queuePartitionKey }`.
   - Law: `SBX_QUEUE_PARTITION=true` requires non-blank `qpk`.
2. **Persistence:** `intentWorkflow` starts. `CompileST` -> `ApplyPatchST` -> `DecideST` -> `ExecuteST`.
3. **Polling:** `TimelineLive` polls `GET /api/runs/:wid` + `/steps` @ 800ms.
   - Headers: `cache: no-store, force-dynamic`.
   - Stop: Terminal set `{SUCCESS, ERROR, CANCELLED, MAX_RECOVERY_ATTEMPTS_EXCEEDED}`.

### 2. Artifact Mastery
Every step emits evidence.
- **Index:** `artifact_index` at `idx=0`.
- **Sentinel:** `kind: none` for steps without domain output.
- **Drill:** `GET /api/artifacts/:uri` (URL-encoded URI).

```typescript
// Artifact fetch snippet
const URI = "artifact://run_123/ExecuteST/0/stdout.log";
const response = await fetch(`/api/artifacts/${encodeURIComponent(URI)}`);
```

### 3. Durability Proof (Live)
1. Start run via UI.
2. `pkill -f 'src/worker/main.ts'` during `ExecuteST`.
3. Restart worker: `mise run start:worker`.
4. **Result:** UI timeline resumes on *same* `wid`. No duplicate `mock_receipts`.

---

## III. 007: Control Plane & Ops Surface
**Goal:** 6-op surface + OTLP + true semantics.

### 1. The Exact-Six API
`GET /api/ops/wf` (List), `GET /api/ops/wf/:wid` (Get), `GET /api/ops/wf/:wid/steps` (Steps), `POST .../cancel`, `POST .../resume`, `POST .../fork`.

### 2. Control Semantics
- **Cancel:** Stop @ next step boundary. Target `PENDING|ENQUEUED`.
- **Resume:** Restart same `wid` from last checkpoint. Target `CANCELLED`.
- **Fork:** New `wid`. Start @ `stepN`. Target `any`.
  - *Law:* `stepN <= max(functionId)`. `409` if OOB.

### 3. OTLP & Traceability
- **Trace Link:** Rendered in header if `traceId` present + `TRACE_BASE_URL` configured.
- **Attrs:** Every span carries `workflowID`, `step.functionID`, `attempt`.

---

## IV. SSOT Manual: Operator Field Guide

### 1. Environment Configuration
Required for production-grade reliability:
| Var | Value | Why |
| :--- | :--- | :--- |
| `DBOS__APPVERSION` | `v1` | Topology parity |
| `SBX_QUEUE_PARTITION`| `true` | Multi-tenant isolation |
| `DBOS_ENABLE_OTLP` | `true` | Enable tracing/logs |
| `TRACE_BASE_URL` | `http://jaeger/trace/{traceId}` | UI deep-linking |
| `OC_MODE` | `live` | Real OpenCode execution |

### 2. Operational Scenarios

#### Scenario A: The "Stuck" Run (Cancel & Resume)
1. **Identify:** `mise run ops:sql:slow` reveals a run stuck in `PENDING`.
2. **Cancel:**
   ```bash
   curl -X POST http://api/ops/wf/wid_123/cancel \
     -d '{"actor":"ops_user", "reason":"stuck_infra"}'
   ```
3. **Verify:** `app.runs.status` is now `canceled`.
4. **Resume:**
   ```bash
   curl -X POST http://api/ops/wf/wid_123/resume \
     -d '{"actor":"ops_user", "reason":"retry_after_fix"}'
   ```

#### Scenario B: Fork After Fix (The Power Move)
1. **Identify:** Run `wid_456` failed at `ExecuteST` (Attempt 3).
2. **Action:** Deploy fix to worker (`v2`).
3. **Fork:**
   ```bash
   curl -X POST http://api/ops/wf/wid_456/fork \
     -d '{"stepN": 4, "appVersion": "v2", "actor":"dev", "reason":"bug_fix_v2"}'
   ```
4. **Result:** New `wid_789` starts at `ExecuteST`, reusing `Compile/Decide` outputs from `wid_456`.

---

## V. End-User Guide: From Idea to Artifact

### 1. Launching an Intent
1. **Chat:** Type "Upgrade deps in package.json" -> Press Enter.
2. **Timeline:** Watch the live-polled rows.
   - `CompileST`: Generating the HTN plan.
   - `DecideST`: Evaluating alternatives.
3. **HITL:** If the plan requires approval, a banner appears: "Approve Plan?".
   ```bash
   # End-user approval (via UI or CLI)
   curl -X POST http://api/runs/wid_xyz/approve-plan -d '{"approvedBy":"user"}'
   ```

### 2. Consuming Results
1. **Artifacts:** Click the "Artifacts" pill on any step.
2. **Diff Viewer:** Open the `patch.diff` artifact to review changes.
3. **Traceability:** Click the "Trace" button to see the OTel span tree in Jaeger.

### 3. Proof of Work (SQL Oracle)
Validate your results directly in the DB:
```sql
-- Check for duplicate side-effects (Law: MUST be 0)
SELECT count(*) FROM app.mock_receipts WHERE seen_count > 1;

-- View my run timeline
SELECT step_id, status, started_at FROM app.run_steps 
WHERE run_id = (SELECT id FROM app.runs WHERE workflow_id = 'my_wid');
```

---

## VI. Proof Floor Matrix
- **Quick:** `fmt` + `lint` + `type` + `fe:test` + `policy`.
- **Check:** `quick` + `integration` + `otlp:smoke`.
- **Full:** `check` + `e2e` + `forced soaks`.
- **SQL Oracle:** `SELECT count(*) FROM app.mock_receipts WHERE seen_count > 1` MUST be `0`.
