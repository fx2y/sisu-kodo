# The Proof Floor (Cycle 7)

| Tier | Task | Oracle | Success Criterion |
| :--- | :--- | :--- | :--- |
| **Quick** | `policy-ops-surface.sh` | CLI probe | Exact 6 routes, actor/reason present. |
| **Check** | `ops-cancel-semantics.test.ts` | `app_local.marks` | `s1=1, s2=0` after cancel mid-step. |
| **Check** | `time-durability.test.ts` | `app.artifacts` | Sleep survives restart; wake reached. |
| **Full** | `wf-crashdemo.sh` | `app.runs` | `SUCCESS` status after crash recovery. |
| **Full** | `wf-intent-chaos.sh` | `app.mock_receipts` | Zero duplicate receipts after 20 runs. |
| **Full** | `otlp-smoke.ts` | HTTP probe | OTLP spans contain `workflowID` and `appVersion`. |
