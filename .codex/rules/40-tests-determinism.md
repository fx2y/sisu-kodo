---
description: deterministic test harness and proof policy
paths:
  - "test/setup.ts"
  - "test/**/*.ts"
---

# Test Determinism Rules

- Default posture: fail-closed, offline-first, deterministic.
- Harness enforces localhost-only networking, seeded randomness wrappers, normalized clock/timezone/locale.
- Unit tests use fake timers/wrappers; no real sleep/time/entropy/remote IO.
- Integration/E2E use local Postgres only with isolated app+sys DB lifecycle.
- Ports/admin daemons are explicit per lane; collisions are correctness failures, not flaky noise.
- Lifecycle start/stop/waits are timeout-bounded; teardown timeout is signoff-fatal.
- Assertions target contract artifacts (HTTP JSON + SQL rows), never log text.
- Every semantic fix ships fail-before/pass-after proof in same change.
- Flake response is entropy root-cause removal, never retry inflation.
- Policy checks are semantic probes with self-tests (`bad=>fail`, `good=>pass`); grep-only checks are invalid.
- Exactly-once proofs include cross-process/restart/cache-cold paths.
- Queue/fairness/throughput claims require SQL oracle evidence (`dbos.workflow_status/events`), not wall-clock anecdotes.
- Ordering/determinism claims require repeated-call equality assertions.
- Goldens fail closed on drift/missing; refresh only via explicit flag (e.g., `REFRESH_GOLDEN=1`) after normalization.
- Soak/repeat evidence is valid only via forced rerun (`mise run -f ...`).
