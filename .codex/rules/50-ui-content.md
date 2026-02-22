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
- Async flows use explicit finite states (`loading|error|empty|running|waiting_input|terminal`).
- Client/server payloads come from shared contracts; boundary parse/assert required, no unchecked casts.
- Unknown/malformed payloads render explicit error cards; never silent fallback.
- Gate UI must consume canonical HITL ABI (`ui:*`, `ui:*:result`, `decision:*`, `ui:*:audit`), with structural guards for legacy-compatible schema variants.
- Reply dedupe keys must be stable across retries for the same user intent (gate/prompt-scoped), never clock-derived.
- Status projection must be total, deterministic, and documented (runtime+DB -> UI enum).
- Canonical run projection: `queued->ENQUEUED`, `running|waiting_input|repairing->PENDING`, `succeeded->SUCCESS`, `failed|retries_exceeded->ERROR`.
- Timeline projection is stable: merge durable+runtime rows, sort by `startedAt` then `stepID`.
- Trace/span fields are nullable-safe; never synthesize IDs client-side.
- Stream UI is adjunct UX only; SQL/events remain proof oracle.
- Artifact viewers require parse guards, MIME-aware rendering, active-content sanitization.
- Accessibility baseline is mandatory: semantic structure, keyboard path, visible focus, deterministic labels.
- Copy must be terse, domain-specific, assertion-friendly.
