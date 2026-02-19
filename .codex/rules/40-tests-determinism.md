---
description: deterministic test harness and proof policy
paths:
  - "test/setup.ts"
  - "test/**/*.ts"
---

# Test Determinism Rules

- Default posture: fail-closed, offline-first, deterministic.
- Harness enforces localhost-only network, seeded RNG, frozen unit-test clock.
- Unit tests use fake timers/wrappers only; no real sleep/time/entropy/IO.
- Integration/E2E use local Postgres only with isolated app+system DB lifecycle per run.
- Port collisions are product bugs; isolate ports or serialize with `--fileParallelism=false`.
- Assertions target machine-readable contracts (HTTP payloads, DB rows), never log text.
- Every bugfix requires fail-before/pass-after proof.
- Flake fixes remove entropy root cause; retries/timeouts are not fixes.
- Goldens fail-closed when missing/drifted; refresh only with `REFRESH_GOLDEN=1` after volatility normalization.
- Policy scripts must self-test with known-bad and known-good fixtures.
- Replay/exactly-once tests include cross-process/cache-cold paths, not only in-memory dedupe.
- Queue fairness/rate assertions include SQL oracle checks (`dbos.workflow_status`), not wall-clock-only checks.
- Soak/repeat evidence must use forced rerun (`mise run -f ...`).
