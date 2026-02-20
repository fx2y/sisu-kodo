---
description: deterministic test harness and proof policy
paths:
  - "test/setup.ts"
  - "test/**/*.ts"
---

# Test Determinism Rules

- Default posture: fail-closed, offline-first, deterministic.
- Harness enforces localhost-only networking, seeded RNG, normalized clock/timezone/locale.
- Unit tests use fake timers/wrappers only; no real sleep/time/entropy/remote IO.
- Integration/E2E use local Postgres only with isolated app+system DB lifecycle.
- Port/daemon coupling must be explicit (pin ports in lane env); collisions/flakes are product bugs.
- Workflow waits/shutdown paths must be timeout-bounded (no indefinite hangs in lifecycle hooks).
- Assertions target machine-readable contracts (HTTP JSON + SQL rows), never log text.
- Every bugfix ships fail-before/pass-after proof in same change.
- Flake handling removes entropy root cause; retries/timeouts are not accepted as fixes.
- Policy scripts self-test with known-bad and known-good fixtures.
- Replay/exactly-once tests must include cross-process/cache-cold paths, not only in-memory dedupe.
- Queue fairness/rate assertions require SQL-oracle evidence (`dbos.workflow_status`), not wall-clock-only checks.
- Goldens fail closed when drift/missing; refresh only with explicit `REFRESH_GOLDEN=1` after normalization.
- Repeat/soak evidence is valid only via forced rerun (`mise run -f ...`).
