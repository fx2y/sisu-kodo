---
description: UI/content/state contracts (if frontend surface exists)
paths:
  - "src/**/*.tsx"
  - "src/**/*.css"
  - "web/**/*"
  - "frontend/**/*"
---

# UI + Content Rules

- UI may be optional; deterministic behavior is not.
- Same props/state must yield same DOM/text ordering.
- Keep one canonical state source per feature; derive, do not duplicate.
- Server-state vs client-state boundary must be explicit and testable.
- Async state machine must be explicit: `loading|error|empty|success`; no silent fallback UI.
- Copy is terse, domain-specific, and assertion-friendly; avoid motivational filler.
- Time/locale/randomized text requires explicit normalization in tests.
- Accessibility baseline is mandatory: semantic structure, keyboard path, visible focus, deterministic labels.
- Frontend request/response shapes must come from shared backend schemas; no ad-hoc inferred contracts.
- Design stance: intentional hierarchy, explicit contrast, consistent affordances; decoration never obscures state/contract clarity.
