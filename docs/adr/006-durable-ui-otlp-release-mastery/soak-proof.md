# Cycle 6 Soak & Release Proof

## Release Decision Matrix (`release-decision.json`)

```json
{
  "decision": "GO",
  "evidence": {
    "quick": "GREEN",
    "full": "GREEN",
    "wf-intent-chaos-soak": "0_DUP_RECEIPTS",
    "sandbox-fanout-soak": "0_DUP_SBX_RUNS"
  },
  "rollbacks": [
    "ANY_SQL_DUPLICATE",
    "TERMINAL_TIMELINE_STALE_PROJECTION",
    "POLICY_GATES_FALSE_POSITIVE"
  ]
}
```

## Verification Procedure (The "Durable Proof")

1. **Reset:** `mise run db:reset && mise run db:sys:reset`.
2. **Crash Test:** `PORT=3000 mise run -f wf:crashdemo`.
3. **Oracle Check:**
   ```sql
   -- Exactly-once check
   SELECT run_id, step_id, task_key, attempt, COUNT(*)
   FROM app.sbx_runs
   GROUP BY 1,2,3,4
   HAVING COUNT(*) > 1; -- MUST BE 0
   ```
4. **Consistency Check:**
   `curl -s /api/runs/$WID/steps` must return `StepRow[]` matching SQL state within 1 poll tick.

## OTLP Surface (Optional Path)

- Enabled via `DBOS_ENABLE_OTLP=true`.
- Trace link in UI header built from `TRACE_BASE_URL` template.
- Absence of `spanID` is a "warning" (null-safe), not a crash or fake-data path.
