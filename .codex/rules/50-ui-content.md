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
- Same inputs/state must yield same DOM/text ordering.
- Keep one canonical state source per feature; derive instead of duplicating.
- Async flow must be explicit state machine (`loading|error|empty|running|terminal`).
- Status projection must be deterministic and documented (DB/runtime -> UI enum mapping).
- Timeline projection must be stable: sort by `startedAt` then `stepID`; merge runtime-visible + durable rows without oscillation.
- Frontend request/response shapes come from shared contracts; assert payloads at client boundary (no unchecked casts).
- Unknown/malformed payloads must render explicit error state, never silent fallback.
- Artifact viewers must be robust: parse guards, MIME-aware rendering, and sanitization for active content.
- Copy is terse, domain-specific, assertion-friendly; avoid motivational filler.
- Accessibility baseline is mandatory: semantic structure, keyboard path, visible focus, deterministic labels.
- Design stance: clear hierarchy/contrast/affordance; decoration cannot obscure state or contract truth.
