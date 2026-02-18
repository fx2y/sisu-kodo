---
description: UI/content/state contracts (if frontend surface exists)
paths:
  - "src/**/*.tsx"
  - "src/**/*.css"
  - "web/**/*"
  - "frontend/**/*"
---

# UI + Content Rules

- UI is optional; determinism is not.
- Same props/state must yield same DOM/text ordering.
- One canonical state source per feature; derived state computed, never duplicated.
- Server-state and client-state boundaries must be explicit.
- Async FSM is explicit: `loading|error|empty|success`; no silent fallback paths.
- Copy is terse/domain-specific/testable; avoid filler language.
- Time/locale/randomized text requires explicit normalization in tests.
- Accessibility baseline is mandatory: semantic structure, keyboard path, visible focus, deterministic labels.
- Frontend request/response contracts must come from shared backend schemas, never ad-hoc inferred shapes.
