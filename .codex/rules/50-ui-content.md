---
description: UI/content/state contracts (if frontend surface exists)
paths:
  - "src/**/*.tsx"
  - "src/**/*.css"
  - "web/**/*"
  - "frontend/**/*"
---

# UI + Content Rules

- UI is optional; deterministic contract behavior is mandatory.
- Same inputs/state must produce same DOM/text/order.
- Keep one canonical state source per feature; derive, do not duplicate.
- Async flow must be explicit finite states (`loading|error|empty|running|terminal`).
- Client/server payloads come from shared contracts; assert at boundary, no unchecked casts.
- Unknown/malformed payloads must render explicit error state; no silent fallback.
- Status projection must be total/deterministic and documented (runtime/DB -> UI enum map).
- Canonical run-status projection:
- `queued -> ENQUEUED`
- `running|waiting_input|repairing -> PENDING`
- `succeeded -> SUCCESS`
- `failed|retries_exceeded -> ERROR`
- Timeline projection must be stable: merge durable + runtime rows, then sort by `startedAt` then `stepID`.
- Trace/span display must be nullable-safe; never synthesize IDs client-side.
- Artifact viewers require parse guards, MIME-aware rendering, and sanitization for active content.
- Copy is terse/domain-specific/assertion-friendly.
- Accessibility baseline is mandatory: semantic structure, keyboard path, visible focus, deterministic labels.
- Visual styling may vary, but state/contract truth must stay primary over decoration.
