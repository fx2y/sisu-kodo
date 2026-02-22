---
description: deterministic test harness and proof policy
paths:
  - "test/setup.ts"
  - "test/**/*.ts"
---

# Test Determinism Rules

- Default posture: fail-closed, offline-first, deterministic.
- Harness must enforce localhost-only networking, deterministic clock/timezone/locale, seeded/wrapped entropy.
- Unit tests use fakes/wrappers; no real sleep, wall-clock, random, or remote IO.
- Integration/E2E use local Postgres only with isolated app+sys DB lifecycle.
- Each lane must own its runtime ports (prefer reserved/ephemeral); fixed host ports are non-signoff in shared envs.
- Lifecycle start/stop/waits are timeout-bounded; teardown timeout is signoff-fatal.
- Assertions target contract artifacts (HTTP JSON + SQL rows + repro packs), never log text.
- Every semantic fix ships fail-before/pass-after proof in the same change.
- Flake response is entropy/root-cause removal, never retry inflation.
- Policy tests are semantic probes with self-tests (`bad=>fail`,`good=>pass`); grep-only checks are invalid.
- Exactly-once proofs include cross-process/restart/cache-cold paths.
- Queue/fairness/throughput claims require SQL oracle evidence (`dbos.workflow_status/events`), not wall-clock anecdotes.
- Determinism claims require repeated-call equality assertions.
- Goldens fail closed on drift/missing; refresh only via explicit flag after normalization.
- Soak/repeat evidence is valid only via forced run (`mise run -f ...`).
