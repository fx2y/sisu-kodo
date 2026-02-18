---
description: deterministic test harness and proof policy
paths:
  - "test/setup.ts"
  - "test/**/*.ts"
---

# Test Determinism Rules

- Default posture: fail-closed, offline-first, deterministic.
- Harness must enforce localhost-only network, seeded RNG, frozen unit-test clock.
- Unit tests: no real sleep/time/entropy/IO; use fake timers + wrappers.
- Integration/E2E: local Postgres only; isolated DB lifecycle per run (app + system DB).
- Port collisions are product bugs; isolate ports or serialize files (`--fileParallelism=false`).
- Assert machine-readable contracts (HTTP/DB rows), never logs.
- Bugfixes require fail-before/pass-after tests; flake fixes must remove entropy root cause (never retries).
- Golden policy: missing baseline fails; refresh only via `REFRESH_GOLDEN=1`; normalize volatile fields first.
- Policy scripts must include self-tests (known-bad fixture must fail; known-good must pass).
- Soak/repeat evidence must use forced rerun (`mise run -f ...`).
