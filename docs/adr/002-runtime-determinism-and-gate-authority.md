# ADR 002: Runtime Determinism + Gate Authority

- Status: Accepted
- Date: 2026-02-17
- Inputs: `spec-0/00-learnings.jsonl` (D01..D27,C01), `spec-0/02-tasks.jsonl` (G,G2,I01..I19)
- Supersedes: none
- Complements: `docs/adr/000-deterministic-workflow-harness.md`, `docs/adr/001-dbos-contract-gates.md`

## Thesis (hard line)

If behavior cannot be replayed deterministically, proven in Postgres, and gated by explicit contracts, it is not a feature; it is an outage seed.

## Decision

Adopt a fail-closed operating constitution with four non-negotiable authorities:

1. `mise` DAG is execution authority.
2. Postgres state is truth authority.
3. Ajv kernel is boundary authority.
4. Determinism policy is reliability authority.

## Non-Negotiables (normative)

1. Architecture seams are fixed: `config|db|workflow|server|oc|sbx|lib`; no cross-layer shortcuts (`D01`).
2. `WorkflowService` port is the only app-facing workflow seam; engines are plugins (`D06`).
3. Config reads occur only in `src/config.ts`; no ambient `process.env` (`D08`).
4. Validation uses one Ajv kernel + `assertValid`; no local Ajv (`D07`).
5. Boundary cast ban at ingress/egress/error paths; use narrowing helpers (`D21`).
6. Four-gate lattice is mandatory: Ingress -> DB-load -> Step-output -> Egress (`D14`).
7. JSON parse errors map to deterministic `400` envelope, never `500` (`D20`).
8. Durable truth is Postgres; memory is transient dedupe/scheduling only (`D01`).
9. Exactly-once core is schema-enforced: `workflow_runs` singleton + `marks(run_id,step)` PK + `ON CONFLICT DO NOTHING` (`D05`).
10. Correctness proof is DB invariant `s1=1,s2=1`; logs are non-authoritative (`D05`).
11. Orchestration is `mise` only; explicit DAG (`check=quick+integration+wf`), no hidden shell/npm DAGs (`D02`,`D23`).
12. Any `run` task declares `sources`; expensive tasks declare `outputs|outputs.auto`, except forced-authority tasks (`D02`,`D26`).
13. Reset tasks are never cacheable (`db:reset`,`db:sys:reset`) (`D24`).
14. Sign-off gates (`check`,`test:e2e`) are non-cacheable (`D26`).
15. Repeats/soaks must use `mise run -f ...` (cache bypass) (`D05`).
16. Runtime pins are hard: Node24 + PG18.2; DB ops via containerized `psql`; `MISE_TASK_OUTPUT=prefix` (`D03`).
17. Entropy/time primitives are banned outside wrappers; retries are banned as flake treatment (`D04`).
18. Golden policy is fail-closed: missing baseline fails; refresh only via `REFRESH_GOLDEN=1` (`D22`,`D25`).
19. Port isolation is explicit per task; no accidental sharing (`D11`,`D15`,`D18`,`D27`).
20. DBOS status verification prefers direct `dbos.workflow_status` SQL over CLI text parsing (`D19`).

## Current Constraints (explicit debt, not hidden)

- DBOS SDK runtime is not authoritative yet; custom PG workflow service is (`C01`).
- `oc:live:smoke` is a contract-stub (endpoint/creds not wired) (`C01`).
- `sbx:live:smoke` is a shell adapter (microVM runner not wired) (`C01`).
- DBOS 4.x quirks are binding: snake_case `system_database_url`; no `${VAR:-default}` placeholders (`D09`).
- DBOS decorators still require Stage-2 TS flags (`experimentalDecorators`,`emitDecoratorMetadata`) (`D10`).

## Why this is correct (compressed proof model)

```text
deterministic inputs
  + explicit DAG execution
  + contract gates at all boundaries
  + DB-level idempotency keys/PKs
  + restart/resume from DB truth
= replayable outcomes + machine-checkable safety
```

Minimal proof query:

```sql
SELECT step, COUNT(*)
FROM app.marks
WHERE run_id = $1
GROUP BY step
ORDER BY step;
-- must be exactly: s1=1, s2=1
```

Deterministic error envelope examples:

```json
{"error":{"code":"BAD_JSON","message":"Invalid JSON payload"}}
{"error":{"code":"VALIDATION_ERROR","message":"Request failed schema validation","details":[...]}}
```

## Coverage Ledger (complete)

### Decisions/constraints -> enforcement

| ID  | Rule (ultra-terse)                      | Enforcement locus                   |
| --- | --------------------------------------- | ----------------------------------- |
| D01 | fixed seams + PG truth                  | module layout + architecture policy |
| D02 | `mise` sole DAG, explicit graph         | `mise.toml` + policy scripts        |
| D03 | Node24/PG18.2/prefix output             | toolchain + env pins                |
| D04 | fail-closed determinism, no retries     | lint/test harness                   |
| D05 | DB-verified durability invariant        | schema + crashdemo + SQL checks     |
| C01 | live integrations intentionally partial | runtime/task constraints            |
| D06 | `WorkflowService` port authority        | `src/workflow/port.ts` seam         |
| D07 | single Ajv kernel                       | `src/contracts/*`                   |
| D08 | config centralization                   | `src/config.ts` only env ingress    |
| D09 | DBOS config quirks honored              | dbos config/task wiring             |
| D10 | Stage-2 decorator flags required        | TS compiler config                  |
| D11 | admin/app port split                    | default ports 3002/3001             |
| D12 | unique `wf_id` per crash run            | scripts generate unique IDs         |
| D13 | repo/service boundary purity            | repo design discipline              |
| D14 | 4-gate lattice mandatory                | server/workflow/view paths          |
| D15 | integration/e2e port+seed isolation     | test runner/task config             |
| D16 | no bundlers + gate-density policy       | policy scripts in `quick`           |
| D17 | golden snapshots for projections        | `test/golden/*`                     |
| D18 | task-level port overrides in DAG        | `run` env overrides                 |
| D19 | DBOS status via SQL                     | status scripts/tasks                |
| D20 | `SyntaxError -> 400`                    | HTTP ingress parsing                |
| D21 | ban boundary `as` casts                 | type narrowing helpers              |
| D22 | missing golden must fail                | e2e golden guard                    |
| D23 | prefer `depends` for graph truth        | task graph refactors                |
| D24 | reset tasks non-cacheable               | removed outputs caching             |
| D25 | normalize Node24 stringify drift        | golden normalization                |
| D26 | sign-off/reset gates force-run          | cache exceptions                    |
| D27 | integration ports dedicated             | 3003/3005 defaults                  |

### Incidents -> closure controls

| ID  | Failure                                | Control now enforced              |
| --- | -------------------------------------- | --------------------------------- |
| I01 | `check` flake from port collision      | env-isolated ports in tasks       |
| I02 | integration `:3002` collision          | sequential files / port isolation |
| I03 | e2e golden drift                       | refresh path + stable baseline    |
| I04 | workflow status task broken            | command/task replacement          |
| I05 | bad JSON returned 500                  | explicit parse try/catch -> 400   |
| I06 | fire-and-forget run trigger            | awaited + caught trigger path     |
| I07 | boundary cast debt                     | helper-based narrowing            |
| I08 | weak task `sources/outputs` policy     | stricter policy script            |
| I09 | golden self-heal false-green           | auto-create removed               |
| I10 | duplicate/obsolete density policy      | policy deduplicated               |
| I11 | brittle CLI crashdemo check            | SQL status verification           |
| I12 | repeated e2e golden failure            | baseline refresh locked-down      |
| I13 | unusable status task UX                | ID-aware status task              |
| I14 | reset tasks cache-skipping             | outputs removed                   |
| I15 | opaque `check` graph                   | `depends` wrappers                |
| I16 | reset still skipped in normal runs     | removed `sources/outputs`         |
| I17 | walkthrough order guaranteed collision | dedicated integration ports       |
| I18 | sign-off gates cache-sensitive         | forced non-cache gates            |
| I19 | triage command cache no-op             | force-run integration task        |

Gate state: `G0/G1/G2/G3 = pass` (audit + showcase).

## Walkthrough / Diagram / Snippet Pack

- Walkthroughs: `docs/adr/002-runtime-determinism-and-gate-authority/walkthroughs.md`
- Commands: `docs/adr/002-runtime-determinism-and-gate-authority/snippets.sh`
- Diagrams: `docs/adr/002-runtime-determinism-and-gate-authority/diagrams.mmd`

## Rejected alternatives (explicit no)

1. Retry-based flake masking.
2. Log-scrape correctness claims.
3. In-memory durable state.
4. Hidden orchestration inside shell scripts.
5. Boundary `as` casts as "pragmatic shortcuts".
6. Auto-creating goldens in normal test flow.

## Consequences

- Upside: reproducible local==CI, machine-checkable durability, bounded blast radius for engine/provider swaps.
- Cost: stricter task metadata discipline, more explicit port/env wiring, deliberate friction around baseline refreshes.
- Planned follow-through: DBOS runtime source-of-truth migration, real OC provider, real SBX microVM.
