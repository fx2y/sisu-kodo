---
description: deterministic test harness policy
paths:
  - "test/setup.ts"
  - "test/**/*.ts"
---

# Test Determinism Rules

- Default posture: fail-closed, offline-first, deterministic.
- Harness MUST enforce localhost-only network, seeded RNG, frozen unit-test clock.
- Unit tests: no real sleep/time/entropy/IO; use fake timers + deterministic wrappers.
- Integration/E2E: local Postgres only, isolated DB lifecycle per run.
- Port collisions are bugs: use unique ports or sequential files (`--fileParallelism=false`).
- Assert contracts via machine-readable outputs (HTTP/DB), never logs.
- Bugfixes need fail-before/pass-after tests; flake fixes must remove entropy root cause (never retries).
- Golden policy: missing baseline fails; refresh only with `REFRESH_GOLDEN=1`; normalize volatile fields first.
- Repeat/soak evidence must force rerun (`mise run -f ...`).
