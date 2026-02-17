---
description: UI/content/state rules if frontend files are introduced
paths:
  - "src/**/*.tsx"
  - "src/**/*.css"
  - "web/**/*"
  - "frontend/**/*"
---

# UI + Content Rules (future-facing)

- UI is optional; determinism is not. Rendered output must be stable for fixed props/state.
- State model: single canonical source per feature; derived state is computed, never duplicated.
- Server state and client state must be separated explicitly; no hidden cross-coupling.
- Text/copy must be precise, terse, and domain-specific; ban filler microcopy.
- Time/random/user-locale dependent text requires explicit normalization strategy in tests.
- Network UI flows need explicit loading/error/empty/success states; no silent fallback.
- Accessibility is baseline: semantic HTML, keyboard path, visible focus, deterministic labels.
