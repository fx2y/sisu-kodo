---
description: deterministic test harness policy
paths:
  - "test/setup.ts"
  - "test/**/*.ts"
---

# Test Determinism Rules

- Default test posture: offline, repeatable, fail-closed.
- Global setup must enforce:
  - network deny except localhost,
  - seeded RNG from env,
  - frozen unit-test clock.
- Unit tests must avoid real sleeps/IO; use fake timers and deterministic wrappers.
- Integration tests may hit local Postgres only; each run gets isolated DB lifecycle.
- E2E tests must assert contracts via machine-readable outputs (HTTP/DB), not logs.
- Any bug fix requires regression test proving fail-before/pass-after.
- Any flake report requires source elimination (time/random/net/order), never retries as “fix”.
- Soak tests are policy tools; when validating repeats, force rerun (`mise run -f ...`).
