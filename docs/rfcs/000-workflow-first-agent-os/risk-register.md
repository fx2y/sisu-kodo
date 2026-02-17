# RFC 000 Risk Register

## Legend

- Prob: L/M/H
- Impact: L/M/H/C
- Score: qualitative priority

## Risks

| ID  | Risk                                               | Prob | Impact | Score | Mitigation                                                            | Kill-switch                    |
| --- | -------------------------------------------------- | ---- | ------ | ----- | --------------------------------------------------------------------- | ------------------------------ |
| R1  | WF nondeterminism leaks via raw time/random/net/fs | M    | C      | P0    | lint + runtime guard + wrapper-only APIs + deterministic tests        | block merge                    |
| R2  | Duplicate side effects on crash/retry              | M    | C      | P0    | PK/unique idempotency keys + `ON CONFLICT DO NOTHING` + replay tests  | disable recipe                 |
| R3  | OC output shape drift                              | H    | H      | P0    | strict JSON schema validation + bounded retry in CompileST            | fail run with contract error   |
| R4  | SBX cold-start variance degrades UX                | H    | H      | P1    | template/snapshot prewarm + queue caps + p95 tracking                 | reduce fan-out, degrade recipe |
| R5  | Worker saturation/starvation                       | M    | H      | P1    | queue partition (`compileQ/sandboxQ/controlQ`) + concurrency budgets  | autoscale workers              |
| R6  | Artifact bloat inflates PG/storage costs           | M    | M      | P2    | artifact size caps + retention tiers + external blob option later     | trim large artifacts           |
| R7  | HITL wait states orphaned                          | M    | H      | P1    | timeout branches + reminder workflows + explicit terminal policy      | auto-cancel stale runs         |
| R8  | Secret leakage in OC transcripts/artifacts         | M    | C      | P0    | redaction filters + secret refs only + audit checks                   | redact + quarantine run        |
| R9  | Multi-provider sandbox abstraction churn           | M    | M      | P2    | pick one provider first, stable interface boundary                    | freeze second adapter          |
| R10 | "Chat-first" feature creep erodes timeline rigor   | H    | H      | P1    | product KPI tied to artifact quality + replay success, not chat turns | roadmap veto                   |

## SLO guardrails

- Replay correctness SLO: `>=99.5%` runs replay from failed step without duplicate side effects.
- Timeline freshness SLO: run-step status visible in UI within `<=2s` p95.
- Sandbox readiness SLO: provider boot+ready `<=1.5s` p95 on hot templates.

## Monitoring queries (examples)

Duplicate risk probe:

```sql
SELECT run_id, step_id, count(*)
FROM app.run_steps
GROUP BY run_id, step_id
HAVING count(*) > 1;
```

Stale HITL runs:

```sql
SELECT id, updated_at
FROM app.runs
WHERE status='waiting_input' AND updated_at < now() - interval '24 hours';
```

## Incident response defaults

1. Stop enqueue for affected recipe.
2. Preserve DB state; never "fix" by deleting run history.
3. Reproduce via deterministic fixture key + replay mode.
4. Patch invariant/test first, then resume traffic.
