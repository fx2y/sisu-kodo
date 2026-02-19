# ADR 005: SBX Substrate & Durable Determinism

## Context
Cycle 0-7 closure. Transition from ad-hoc execution to a durable, multi-tenant sandbox substrate. Core requirement: **exactly-once SQL-oracle truth** over logs/memory.

## Decision: Hard Lattice Guardrails
- **Fail-Closed Ingress:** No boundary `as` casts. Ajv `SBXReq|SBXRes` + `queue-policy` pre-enqueue check. 400 + zero writes on violation.
- **Split Topology:** Shim (enqueue/read) != Worker (execute). Partitioned `sbxQ` for fan-out; `intentQ` for parent control.
- **Determinism law:** Ban `Math.random|Date|hrtime` outside wrappers. Pin RNG seed.

## Decision: Durable Execution Oracle
- **PK Stability:** `task_key = SHA256(canonical(JSON))` for cross-process dedupe.
- **Append-Only Attempts:** `sbx_runs`, `run_steps`, `artifacts` PKs include `attempt`. Latest-wins projection for UI.
- **Exactly-Once:** `workflowID = taskId`. `ON CONFLICT DO NOTHING` + manual receipt persistence in parent step.
- **Artifacts:** `artifact://` URIs. `idx=0` is `ArtifactIndex`. No placeholder SHAs.

## Topology & Flow
```text
[API] -> (intentQ) -> [IntentWF] -> (sbxQ) -> [TaskWF] -> [Provider]
  ^          ^           |            ^          |           |
  |      [Policy]        |------(FanOut)---------|      [E2B/Shell]
  |                      |                       |           |
  +---<-(RunView)---<--[DB]----<---(Artifacts/Metrics/Streams)---+
```

## Oracle Verification (SQL First)
```sql
-- Exactly-once Proof
SELECT task_key, COUNT(*) FROM app.sbx_runs GROUP BY 1 HAVING COUNT(*)>1; -- Must be 0

-- Integrity Proof
SELECT COUNT(*) FROM app.artifacts WHERE sha256 !~ '^[0-9a-f]{64}$'; -- Must be 0

-- Topology Proof (Starvation)
SELECT queue_name, COUNT(*) FROM dbos.workflow_status WHERE status='QUEUED' GROUP BY 1;
-- intentQ > 0 while sbxQ full => Starvation Deadlock
```

## Operational Stance
- **Strict Mode:** `OC_STRICT_MODE=1` forces real provider paths; no credential-missing skips.
- **Triage:** DB Health -> `/healthz` -> `app.runs` -> `dbos.workflow_status`.
- **Golden:** `REFRESH_GOLDEN=1` only after volatility normalization.
