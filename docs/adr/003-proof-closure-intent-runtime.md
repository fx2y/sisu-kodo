# ADR 003: Proof Closure for Deterministic Intent Runtime

- Status: Accepted
- Date: 2026-02-18
- Inputs: `spec-0/00-learnings.jsonl` (A01..A08,C01,L10..L55), `spec-0/03-tasks.jsonl` (C0..C6)
- Supersedes: none
- Complements: `docs/adr/000-deterministic-workflow-harness.md`, `docs/adr/002-runtime-determinism-and-gate-authority.md`, `docs/adr/002-cycle1-closure.md`

## Thesis (non-negotiable)

If correctness is not DB-provable under kill/restart/parallel load, it is undefined behavior, not shipped behavior.

## Decision (hard law)

1. Keep strict seams: `config -> {db,workflow,server,oc,sbx,lib}`; repo=SQL map only; env ingress only `src/config.ts`.
2. Keep deterministic split: `wf/**` pure control; `steps/**` impure IO; policy gates self-test negatives every run.
3. Keep orchestration single-source: `mise` only, explicit DAG, exact always-run exceptions only (`db:reset|db:sys:reset|test:e2e`), global serialization when shared DB contention exists (`[settings].jobs=1`).
4. Keep runtime pins and port hygiene fixed: Node24, PG18.2, dockerized `psql`, `MISE_TASK_OUTPUT=prefix`, app/admin split, per-lane port isolation.
5. Keep boundary fail-closed: central Ajv kernel, 4-gate lattice (`ingress -> db-load -> step-output -> egress`), no boundary `as`, deterministic `400` on JSON/schema failures.
6. Keep identity/timeline immutable: `workflowID=intentId`, fixed step IDs (`CompileST|ApplyPatchST|DecideST|ExecuteST`), per-step persisted output before return.
7. Keep queueing prevalidated: recipe/workload/caps checked pre-enqueue; class deterministic (`compileQ|sandboxQ|controlQ`); over-cap => `400`, zero writes.
8. Keep recovery explicit: capped retries, terminal projection `retries_exceeded + next_action=REPAIR`, retry envelope deterministic `{accepted,newRunId,fromStep}`, HITL events only in `waiting_input`.
9. Keep split topology strict: shim enqueue/read only via `DBOSClient`; worker imports workflows; matching `application_version` required.
10. Keep durability oracle SQL-only: `app.runs`, `app.run_steps`, `app.mock_receipts`, `app.opencode_calls`, `dbos.workflow_status`; logs are non-authoritative.

## Proof Model (compressed)

```text
deterministic inputs + fail-closed boundaries + DB idempotency keys/PKs
+ serialized conflict lanes + restart/repair from persisted checkpoints
= exactly-once externally visible effects + replay-safe forensic audit
```

Minimal acceptance oracle:

```sql
SELECT step, COUNT(*) c
FROM app.marks
WHERE run_id=$1
GROUP BY step
ORDER BY step;
-- required: s1=1,s2=1
```

Deterministic failure/repair contracts:

```json
{"status":"retries_exceeded","nextAction":"REPAIR"}
{"accepted":true,"newRunId":"repair-...","fromStep":"DecideST"}
```

## Coverage Ledger (complete)

### Learnings -> enforced invariant -> proof surface

| Learnings               | Invariant now fixed                                                                                                                        | Primary proof/task surface                                     |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| A01,A06,A08             | strict seams + contracts + DBOS quirks                                                                                                     | policy gates, TS config, runtime boot                          |
| A02,A03,A04,A07         | `mise` authority + pins/ports + determinism + golden fail-closed                                                                           | `quick/check/full`, forced `-f` soaks, golden guards           |
| A05                     | DB truth over logs, exactly-once schema, SQL oracle                                                                                        | crashdemo, marks PK, `workflow_status` SQL                     |
| C01                     | known live limits are explicit debt (not hidden)                                                                                           | stub-smoke contracts + ADR disclosure                          |
| L10,L11,L12,L13,L14,L15 | wf split/start path/identity/stable steps/intentQ restoration                                                                              | workflow module split, wrapper-only starts, schema constraints |
| L20,L21,L22,L23,L24     | bounded recovery + ops diagnostics + repair + HITL + sys reset discipline                                                                  | retry/event integration + e2e + `db:sys:reset` lanes           |
| L30                     | worker/shim split + appversion coupling                                                                                                    | API-shim e2e + blackbox policy                                 |
| L40,L41,L42,L43,L44     | queue caps + side-effect forensics + chaos hardening + global serialization + 4-proof ship line                                            | chaos/soak/check/full joint gate                               |
| L50,L51,L52,L53,L54,L55 | terminal projection, typed repair checkpoints, retry envelope, policy self-verification, task metadata hardening, stronger shim e2e oracle | C5 regression suite + policy negative probes                   |

### Task closure map (all done)

| Cycle | Closed set                                 |
| ----- | ------------------------------------------ |
| C0    | `C0.T00..C0.T06`, `C0.G0`                  |
| C1    | cycle node `C1`; `C1.T10..C1.T16`, `C1.G1` |
| C2    | cycle node `C2`; `C2.T20..C2.T25`, `C2.G2` |
| C3    | cycle node `C3`; `C3.T30..C3.T35`, `C3.G3` |
| C4    | cycle node `C4`; `C4.T40..C4.T46`, `C4.G4` |
| C5    | cycle node `C5`; `C5.T50..C5.T59`, `C5.G5` |
| C6    | `C6.T60..C6.T66`, `C6.G6`                  |

No open task/gate remains in `spec-0/03-tasks.jsonl`.

## Operational Walkthrough Pack

- Walkthroughs: `docs/adr/003-proof-closure-intent-runtime/walkthroughs.md`
- Snippets: `docs/adr/003-proof-closure-intent-runtime/snippets.sh`
- Diagrams: `docs/adr/003-proof-closure-intent-runtime/diagrams.mmd`

## Explicit Rejections

1. Retry-as-flake treatment.
2. Log-scrape correctness claims.
3. Queue admission without pre-enqueue policy checks.
4. Shim importing workflow internals.
5. Repair resume via unchecked casts/non-null chains.
6. Broad regex exceptions in task-metadata policy.

## Consequences

- Upside: reproducible local/CI behavior, durable exactly-once evidence, restart-safe repair/HITL semantics, auditable side effects.
- Cost: stricter gate friction, serialized conflict lanes, explicit port/appversion management.
- Remaining debt (declared): live OC provider wiring, microVM SBX runner wiring.
