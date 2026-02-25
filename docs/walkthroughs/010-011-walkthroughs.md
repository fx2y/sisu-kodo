# Sisu-Kodo 010-011 Expert Walkthroughs

## 0. Preflight: Live Environment Config
SSOT for environment posture. Mandatory for split-topology execution.

```bash
# Posture: split-topology, replay-OC, mock-SBX, strict-partition
export WORKFLOW_RUNTIME_MODE=api-shim
export OC_MODE=replay
export SBX_MODE=mock
export SBX_PROVIDER=e2b
export SBX_QUEUE_PARTITION=true
export DBOS__APPVERSION=v1
export BASE=http://127.0.0.1:3001

# Toolchain Bootstrap
mise install
mise run db:up
mise run db:sys:reset && mise run db:reset && mise run db:migrate
mise run build
```

---

## 1. Spec-10: Throughput & Hardening (FDE/QA SSOT)
Focus: Split-topology, Queue Law, Budgets, and Hot Templates.

### 1.1 Split-Topology Boot
Execute in two distinct process groups to verify boundary isolation.
- **Worker**: Executes `intentQ` + `sbxQ`. No HTTP ingress.
- **API-Shim**: Enqueues to `intentQ`. No DBOS workflow execution.

```bash
# Terminal 1: Worker
PORT=3001 ADMIN_PORT=3002 mise run start:worker
# Terminal 2: API-Shim
PORT=3001 ADMIN_PORT=3003 mise run start:api-shim
```

### 1.2 Queue Law & Partitioning
Verify parent/child isolation and propagation.
- **Law**: Parent = `intentQ`, Child = `sbxQ`.
- **Dedupe**: Same `intent_hash` => same `workflow_id` (ih_<hash>).

```bash
# 1. Start run with partition key
B='{"recipeRef":{"id":"compile-default","v":"v1"},"formData":{"goal":"perf-test"},"opts":{"queuePartitionKey":"tenant-a","lane":"interactive"}}'
W=$(curl -sS -X POST $BASE/api/run -H 'content-type: application/json' -d "$B" | jq -r .workflowID)

# 2. SQL Oracle: Verify parent partition + status
scripts/db/psql-sys.sh -c "select workflow_uuid, queue_name, queue_partition_key, status from dbos.workflow_status where workflow_uuid='$W'"
```

### 1.3 SBX Hot Templates
Verify rotation by `depsHash` and boot p95 gain.
```bash
# 1. Build & Register template
mise run sbx:template:build -- --register

# 2. Verify Registry (Immutable Rows)
scripts/db/psql-app.sh -c "select recipe_id, deps_hash, template_key from app.sbx_templates order by created_at desc limit 1"
```

### 1.4 Hard Budgets & Backpressure
Verify ingress rejection and runtime stop artifacts.
```bash
# 1. Ingress Rejection (Too many steps for budget)
BAD_B='{"recipeRef":{"id":"compile-default","v":"v1"},"formData":{"goal":"fail"},"opts":{"budget":{"maxFanout":0,"maxSBXMinutes":1,"maxArtifactsMB:1,"maxRetriesPerStep":0,"maxWallClockMs":1}}}'
curl -i -X POST $BASE/api/run -H 'content-type: application/json' -d "$BAD_B" # Expect 400

# 2. Runtime Stop Artifact (SQL Proof)
scripts/db/psql-app.sh -c "select step_id, artifact_kind, payload from app.artifacts where step_id='BUDGET' limit 1"
```

---

## 2. Spec-11: Operator UX & Proof (End-User Manual)
Focus: Run Console, HITL Inbox, Ops Controls, and Signoff.

### 2.1 Canonical Run Console (S01-S03)
Primary path for starting and monitoring work.
1. **Navigate**: `http://localhost:3000/`
2. **Action**: Input goal in ChatInput. Click **Run**.
3. **Observe**: 
   - Posture badges (Split, Replay, v1) appear in header.
   - Status transitions: `ENQUEUED` -> `PENDING` -> `SUCCESS`.
   - **Lattice**: If you restart with same goal, observe **Idempotent Replay** toast.

### 2.2 HITL Inbox & Approvals (S04-S06)
1. **Navigate**: `http://localhost:3000/?board=hitl-inbox`
2. **Action**: Find your run. Click **Open Gate**.
3. **Approval**: Select **Origin: manual**. Input decision. Click **Submit**.
4. **Law Check**: Verify `human_interactions` SQL contains the `origin`.
   ```bash
   scripts/db/psql-app.sh -c "select workflow_id, origin, payload_hash from app.human_interactions order by created_at desc limit 1"
   ```

### 2.3 Ops Console & Incident Control (S07)
1. **Navigate**: `http://localhost:3000/?board=ops`
2. **Backlog**: Check **Queue Depth** panel for `intentQ` vs `sbxQ` pressure.
3. **Mutation**: Select a stuck run. Open **Drawer**. 
   - Mandatory: **Actor**, **Reason**.
   - **Fail-Closed**: If status is `SUCCESS`, **Cancel** is disabled (Illegal Transition).

### 2.4 Proof & Repro Oracle (S08, S15)
1. **Action**: On any run, click **Proof Tab**.
2. **Drill-down**: Select **SQL App** subtab. Inspect raw rows confirming side-effects.
3. **Repro**: Open **Repro Drawer**. Click **Generate Snapshot**.
   ```bash
   # CLI Verification
   pnpm exec tsx scripts/repro-pack.ts --run <wid> --out .tmp/triage.json
   ```
4. **Signoff**: Open `/?board=signoff`. Binary check: If any CI lane or mandatory proof is missing, verdict = **NO_GO**.

---

## 3. Operational SSOT: Incident Triage
Deterministic order of operations for FDEs.

1. **Check Health**: `curl $BASE/healthz` (API/DB connectivity).
2. **Check Posture**: Header badges (Topology/Version mismatch?).
3. **SQL Triage (Oracle Order)**:
   ```sql
   -- 1. App State
   SELECT status, last_step FROM app.runs WHERE workflow_id = 'wid';
   -- 2. System State
   SELECT status, queue_name, error FROM dbos.workflow_status WHERE workflow_uuid = 'wid';
   -- 3. Side-effect Check (Exactly-Once)
   SELECT count(*) FROM app.run_steps WHERE run_id = 'id' GROUP BY step_id HAVING count(*)>1;
   ```
4. **Repro**: Generate pack and attach to ticket.
5. **Repair**: Use **Ops Console -> Resume** or **Fork** from last valid step.

---

## 4. End-User Values Checklist
- **Deterministic Start**: `/api/run` is your entrypoint. Hash-linked identity ensures no duplicate executions.
- **Audit Integrity**: Every human decision (HITL) and operator override (Ops) is immutable and provenance-tagged.
- **Binary Signoff**: You never ship on "Amber". Signoff board is green only if every proof gate (CI, SQL, Policy) is green.
- **Fail-Closed**: If inputs drift or budgets are exceeded, the system halts with a 400/409 before a single DB write occurs.
