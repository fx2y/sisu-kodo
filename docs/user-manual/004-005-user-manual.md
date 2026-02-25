# Sisu-Kodo Ops Manual: C4 (OpenCode) & C5 (SBX)

## 0. Env Configuration (Live/Signoff)
Must be set for worker/shim parity. Non-compliance => `NO_GO`.

```bash
# Core Connectivity
export OC_BASE_URL=http://127.0.0.1:4096
export OC_SERVER_PORT=4096
export OC_MODE=live            # 'replay' for deterministic mock, 'live' for provider
export SB_MODE=live            # 'mock' for local, 'live' for E2B/Microsandbox
export SBX_PROVIDER=e2b        # Default provider v0

# Topology & Identity
export PORT=3001
export ADMIN_PORT=3002
export DBOS__APPVERSION=v1     # Must match between Shim and Worker
export OC_STRICT_MODE=1        # Fail-closed on missing credentials
```

## 1. Unified Workflow: Intent -> Plan -> Fanout
Combined C4 (Structured Compile) and C5 (SBX Fanout) execution.

### L01: Intent & Trace
```bash
# 1. Create Intent
I=$(curl -sS -X POST $BASE/intents -d '{"goal":"build logic","inputs":{},"constraints":{}}' | jq -r .intentId)

# 2. Trigger Run (with Partitioning)
R=$(curl -sS -X POST $BASE/intents/$I/run -d '{
  "recipeName":"sandbox-default",
  "queuePartitionKey":"tenant-alpha",
  "workload":{"concurrency":5,"steps":10}
}' | jq -r .runId)
```

### L02: The Approval Gate (MP23)
Build execution is hard-blocked until Plan approval.
```bash
# 1. Wait for Plan (CompileST)
# Poll /runs/$R until status == 'waiting_input' and lastStep == 'DecideST'

# 2. Inspect Plan Artifact (artifact://run/$R/step/CompileST/task/default/plan_card)
# 3. Approve
curl -sS -X POST $BASE/runs/$R/approve-plan -d '{"approvedBy":"ops-lead"}'
```

### L03: Fanout Progress (C3/C4)
Monitor parallel sandbox tasks and telemetry.
```bash
# Watch live status events
curl -sS $BASE/runs/$R/events # Phase transitions
# View terminal projection (RunView)
curl -sS $BASE/runs/$R | jq '.steps[] | select(.stepId=="ExecuteST") .output.raw.tasks'
```

## 2. Hardening & Chaos (BetE/C5)
Proofs of exactly-once and failure normalization.

### Scenario: Infra Outage Recovery
Provider `BOOT_FAIL` or `TIMEOUT` triggers DBOS infra-retry; `CMD_NONZERO` fails closed.
```bash
# Trigger "fail me" intent to force non-zero exit
# Observe status -> retries_exceeded -> REPAIR
curl -sS -X POST $BASE/runs/$R/retry | jq # Returns same runId, resumes from failed step
```

### Scenario: Process Crash (Chaos)
`mise run -f wf:intent:chaos` - Kills worker mid-fanout.
**Oracle Verification:**
```sql
-- Assert no duplicate side-effects (C5 Law)
SELECT COUNT(*) FROM app.mock_receipts WHERE seen_count > 1; -- MUST BE 0

-- Assert taskKey dedupe collisions
SELECT task_key, COUNT(*) FROM app.sbx_runs GROUP BY 1 HAVING COUNT(*) > 1; -- Only per-attempt
```

## 3. SQL Oracles (Truth SoT)
Bypass logs; trust the ledger.

### SBX Execution & Metrics (C5)
```sql
SELECT 
  task_key, 
  err_code, 
  (metrics->>'wallMs')::int as latency,
  response->>'sandboxRef' as sbx
FROM app.sbx_runs 
WHERE run_id = '$R' 
ORDER BY created_at;
```

### Queue Partitioning & Fairness (C3)
```sql
SELECT 
  queue_partition_key, 
  status, 
  COUNT(*) 
FROM dbos.workflow_status 
WHERE queue_name = 'sbxQ' 
GROUP BY 1, 2;
```

### Artifact Integrity (MP21/C1)
```sql
-- Assert 64-hex SHA-256 (No placeholders)
SELECT uri, sha256 
FROM app.artifacts 
WHERE sha256 !~ '^[0-9a-f]{64}$'; -- SHOULD RETURN 0 ROWS
```

## 4. Troubleshooting (Triage Matrix)
- **400 `queue_policy_violation`**: Workload > Recipe caps or parent queued on `sbxQ`.
- **409 `illegal_state`**: Sending `/events` when status is not `waiting_input`.
- **409 `retry_drift`**: `/retry` called on a run that is already `succeeded`.
- **Stuck `queued`**: Check `DBOS__APPVERSION` parity and `oc:daemon:health`.
- **`CMD_NONZERO`**: Intent-level logic error. Check `artifact_index` for stderr logs.
```bash
# Quick Reset
mise run stop && mise run db:reset && mise run db:sys:reset
```
