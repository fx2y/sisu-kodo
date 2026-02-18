# ADR 002: Cycle-1 Closure (C4)

## Status

Accepted

## Decision

Cycle `C4` is closed with two forced-rerun proof lanes and one closure policy gate:

- `wf:intent:chaos:soak` (20 kill/restart iterations).
- `sandbox:soak` (100 run parallel throughput lane).
- `policy:boundary-gates` (golden/canary/identity/receipt-guard fence).

## Rationale

- Chaos proof must be intent-centric, not crashdemo-only.
- Throughput claims must fail if duplicate side effects are observed.
- Completion fences must be encoded as automation, not hand-checklists.

## Implications

- Queue classes are explicit (`compileQ`, `sandboxQ`, `controlQ`, legacy `intentQ`).
- Per-recipe caps are enforced pre-enqueue via `recipeRepo + queue-policy`.
- Step outputs carry `attempt`; external mock receipts are dedupe-guarded.
- Decide step persists opencode request/response envelope rows for replay forensics.
- `full` now includes both C4 soak lanes.

## Closure Commands

```bash
mise run -f wf:intent:chaos:soak
mise run -f sandbox:soak
mise run check
mise run full
```

## Oracle

Cycle passes only if:

- chaos soak finishes with no duplicate receipt (`seen_count > 1` must be `0`)
- sandbox soak finishes `100/100` succeeded with no duplicate receipt
- core gates remain green (`check`, `full`)
