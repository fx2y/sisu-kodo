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
- Port/daemon coupling must be explicit per lane; collisions/flakes are product bugs.
- Lifecycle waits/shutdown must be timeout-bounded; no indefinite hooks.
- Assertions target machine-readable contracts (HTTP JSON + SQL rows), never log strings.
- Every semantic bugfix ships fail-before/pass-after proof in same change.
- Flake handling removes entropy root cause; retry inflation is not a fix.
- Policy scripts must self-test with known-bad/fail and known-good/pass fixtures.
- Policy checks should be semantic probes (request->response/sql), not grep-only text scans.
- Replay/exactly-once tests must cover cross-process/cache-cold paths, not only in-memory dedupe.
- Queue fairness/rate assertions require SQL oracle evidence (`dbos.workflow_status`), not wall-clock-only checks.
- Deterministic ordering claims require repeated-call equality assertions.
- Goldens fail closed on drift/missing; refresh only with explicit `REFRESH_GOLDEN=1` after normalization.
- Soak/repeat evidence is valid only via forced rerun (`mise run -f ...`).
