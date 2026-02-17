---
description: UI/content/state rules if frontend files are introduced
paths:
  - "src/**/*.tsx"
  - "src/**/*.css"
  - "web/**/*"
  - "frontend/**/*"
---

# UI + Content Rules (future-facing)

- UI is optional; deterministic output is mandatory.
- Fixed props/state must yield stable DOM/text.
- One canonical state source per feature; derived state is computed, never duplicated.
- Separate server-state vs client-state explicitly; no hidden coupling.
- Async flows must model `loading|error|empty|success` explicitly; no silent fallbacks.
- Copy must be terse/domain-specific/testable; ban filler microcopy.
- Locale/time/random text requires explicit normalization in tests.
- Accessibility baseline is required: semantic structure, keyboard path, visible focus, deterministic labels.
- Frontend contract types/schemas must come from shared backend contracts, not ad-hoc inference.
