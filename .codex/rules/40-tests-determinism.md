---
description: deterministic harness, proof, and flake-response invariants
paths:
  - "test/setup.ts"
  - "test/**/*.ts"
---

# Test Determinism Rules

- Default posture fail-closed, offline-first, deterministic.
- Harness enforces localhost-only networking, deterministic timezone/locale, seeded/wrapped entropy.
- Unit tests: no real sleep, wall-clock assertions, random identity, or remote IO.
- Integration/E2E: local Postgres only with isolated app+sys DB lifecycle.
- Each lane owns unique runtime ports; fixed-port parallel runs are non-signoff evidence.
- Kernel seed law: never TRUNCATE/delete recipe seed tables (`app.recipes`,`app.recipe_versions`) in shared integration DBs.
- Repeated/shared-DB suites isolate workflow IDs per run (fresh nonce scope), never global-row assumptions.
- Lifecycle start/stop/waits timeout-bounded; teardown timeout signoff-fatal.
- Teardown law: cancel active `PENDING|ENQUEUED` workflows before `DBOS.shutdown()`.
- Assertions target contract artifacts (HTTP JSON + SQL rows + repro packs), never log text.
- Every semantic fix ships fail-before/pass-after proof in same change.
- Flake response is root-cause elimination (entropy/time/order race), never retry inflation.
- Policy tests are semantic probes with self-tests (`bad=>fail`,`good=>pass`); grep-only checks invalid.
- Exactly-once proofs include cross-process/restart/cache-cold paths.
- Queue/fairness/throughput claims require SQL oracle evidence (`dbos.workflow_status/events`).
- Determinism claims require repeated-call equality assertions.
- Split-DB divergence proofs must assert app->sys two-step query semantics (`workflow_uuid`), never cross-db join.
- Goldens fail closed on drift/missing; refresh only via explicit normalization flag.
- Soak/repeat evidence valid only via forced run (`mise run -f ...`).
- Coverage/closure claims require referenced proof artifacts to exist and execute (no ghost refs).
- Scenario-matrix claims require executable matrix test + rows containing `scenarioId` and `proofRefs[]`.
