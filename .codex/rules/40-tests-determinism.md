---
description: deterministic test harness and proof policy
paths:
  - "test/setup.ts"
  - "test/**/*.ts"
---

# Test Determinism Rules

- Default posture: fail-closed, offline-first, deterministic.
- Harness enforces localhost-only network, seeded RNG, frozen unit-test clock.
- Unit tests: no real sleep/time/entropy/IO; use fake timers + wrappers.
- Integration/E2E: local Postgres only; isolated app+system DB lifecycle per run.
- Port collisions are product bugs; isolate ports or serialize with `--fileParallelism=false`.
- Assertions must target machine-readable contracts (HTTP payloads, DB rows), never log text.
- Every bugfix requires fail-before/pass-after proof.
- Flake fixes must remove entropy root cause; retries/timeouts are not accepted as fix.
- Goldens fail closed when missing; refresh only with `REFRESH_GOLDEN=1` after volatile field normalization.
- Policy scripts must self-test with known-bad and known-good fixtures.
- Replay/exactly-once tests must include cross-process/cache-cold scenarios, not just in-memory cache paths.
- Soak/repeat evidence must use forced rerun (`mise run -f ...`).
