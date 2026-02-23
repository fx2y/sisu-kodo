---
description: UI/content/state contract determinism rules
paths:
  - "src/**/*.tsx"
  - "src/**/*.css"
  - "web/**/*"
  - "frontend/**/*"
---

# UI + Content Rules

- UI optional; contract fidelity mandatory.
- Same input/state must produce same DOM/text/order.
- Keep one canonical state source per feature; derive, never duplicate.
- Async UI state machine explicit+total: `loading|error|empty|running|waiting_input|terminal`.
- Client/server payloads use shared contracts with parse/assert guards; no unchecked casts.
- Unknown/malformed payloads render explicit error surfaces; no silent fallback.
- HITL UI consumes frozen key/topic ABI; compat variants require explicit structural guard.
- Reply dedupe keys must be stable intent-scoped values; never time/random-derived.
- Status projection deterministic, documented, monotonic under merge.
- Canonical projection: `queued->ENQUEUED`, `running|waiting_input|repairing->PENDING`, `succeeded->SUCCESS`, `failed|retries_exceeded->ERROR`.
- Timeline merge/sort stable (`startedAt` then deterministic tie-breaker).
- Trace/span fields nullable-safe; client must not synthesize IDs.
- Streams adjunct UX only; SQL/events remain proof oracle.
- Artifact viewers require parse guards, MIME-aware rendering, active-content sanitization.
- Accessibility baseline mandatory: semantic structure, keyboard path, visible focus, deterministic labels.
- Copy terse, domain-specific, assertion-friendly.
