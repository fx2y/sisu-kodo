# Repro Pack & SQL Oracle

ADR 009 establishes the **SQL Oracle Law**: SQL rows are the only source of proof; logs are for narration only. The `repro-pack` CLI utility is the implementation of this law.

## Concept: Reproducibility Tuple

A run's state is fully defined by the set of all database rows associated with its `workflow_id`.

### Repro Snapshot Components

| Section             | Description               | Key                            |
| :------------------ | :------------------------ | :----------------------------- |
| `run`               | Run header/status         | `id`, `status`                 |
| `intent`            | Compiled intent           | `id`, `hash`, `json`           |
| `runSteps`          | Step execution history    | `run_id`, `step_id`, `attempt` |
| `artifacts`         | Step outputs              | `run_id`, `step_id`, `idx`     |
| `evalResults`       | Eval engine output        | `run_id`, `check_id`           |
| `sbxRuns`           | Child sandbox runs        | `task_key`, `run_id`           |
| `opencodeCalls`     | Agent interaction history | `run_id`, `op_key`             |
| `humanGates`        | HITL gate registry        | `run_id`, `gate_key`           |
| `humanInteractions` | HITL reply ledger         | `workflow_id`, `gate_key`      |
| `dbos`              | Workflow status & events  | `workflow_uuid`                |

## Usage

FDEs must always attach a `.repro.json` artifact to any incident report or signoff evidence.

### Command: Export Repro

```bash
# Export full repro pack for a given run
pnpm exec tsx scripts/repro-pack.ts --run <wid> --out /tmp/<wid>.repro.json
```

## Significance

The `repro-pack` enables offline replay and verification of any production run. By snapshotting the DBOS `workflow_events` and `workflow_status` for both the parent and discovered child workflows (SBX, fixtures, escalation), it provides a complete trace of the system's execution.
