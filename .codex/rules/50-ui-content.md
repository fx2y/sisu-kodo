---
description: UI/content/state contracts (if frontend surface exists)
paths:
  - "src/**/*.tsx"
  - "src/**/*.css"
  - "web/**/*"
  - "frontend/**/*"
---

# UI + Content Rules

- UI is optional; contract fidelity is mandatory.
- Same input/state must yield same DOM/text/order.
- Keep one canonical state source per feature; derive, do not duplicate.
- Async state machine must be explicit and total (`loading|error|empty|running|waiting_input|terminal`).
- Client/server payloads must come from shared contracts with parse/assert guards; no unchecked casts.
- Unknown/malformed payloads render explicit error surfaces; never silent fallback.
- Gate UI consumes frozen HITL ABI keys/topics with structural guards for sanctioned compat variants.
- Reply dedupe keys must be stable for same user intent (gate/prompt scoped), never clock-derived.
- Status projection must be deterministic and documented (`runtime+DB -> UI enum`), monotonic under merge.
- Canonical projection: `queued->ENQUEUED`, `running|waiting_input|repairing->PENDING`, `succeeded->SUCCESS`, `failed|retries_exceeded->ERROR`.
- Timeline merge/sort is stable (`startedAt` then deterministic tie-breaker).
- Trace/span fields are nullable-safe; never synthesize IDs client-side.
- Stream UI is adjunct UX only; SQL/events remain proof oracle.
- Artifact viewers require parse guards, MIME-aware rendering, and active-content sanitization.
- Accessibility baseline is mandatory: semantic structure, keyboard path, visible focus, deterministic labels.
- Copy stays terse, domain-specific, assertion-friendly.
