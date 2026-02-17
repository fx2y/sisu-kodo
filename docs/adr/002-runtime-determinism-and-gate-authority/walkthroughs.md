# Walkthroughs: ADR 002

## W0: Bootstrap + deterministic baseline

```bash
mise install
mise run quick
```

Expect:

- toolchain pins resolved (Node24, PG18.2).
- policy/lint/type/unit gates pass.
- deterministic harness active (frozen clock, seeded RNG, localhost-only net).

## W1: Reset authority (must always execute)

```bash
mise run db:reset
mise run db:sys:reset
```

Expect:

- no cache short-circuit; resets run every invocation.
- app schema and system schema are clean/reinitialized.

Failure smell:

- reset appears instant/no-op with stale state intact -> cache contract broken.

## W2: Durability crash proof (DB, not logs)

```bash
PORT=3004 ADMIN_PORT=3006 mise run -f wf:crashdemo
```

Then verify DB invariant:

```sql
SELECT step, COUNT(*)
FROM app.marks
WHERE run_id = '<wf_id_from_run>'
GROUP BY step
ORDER BY step;
```

Expect exactly:

- `s1 | 1`
- `s2 | 1`

Meaning:

- side effects are duplicate-safe across crash/restart.

## W3: Product HTTP flow (contract-safe)

```bash
# terminal A
PORT=3001 ADMIN_PORT=3002 mise run dev

# terminal B
curl -sS -X POST localhost:3001/intents \
  -H 'content-type: application/json' \
  -d '{"kind":"demo","payload":{"x":1}}'

curl -sS -X POST localhost:3001/intents/<intent_id>/run
curl -sS localhost:3001/runs/<run_id>
```

Expect:

- stable JSON shape.
- run transitions to `succeeded`.
- no boundary `as`-style runtime ambiguity.

## W4: Fail-closed ingress/e2e safety

Bad JSON:

```bash
curl -i -X POST localhost:3001/intents \
  -H 'content-type: application/json' \
  -d '{"kind":'
```

Bad schema:

```bash
curl -i -X POST localhost:3001/intents \
  -H 'content-type: application/json' \
  -d '{"kind":123,"payload":"x"}'
```

Expect:

- both are deterministic `400`.
- invalid payloads do not write DB rows.

## W5: Golden behavior (no false-green)

```bash
mise run test:e2e
```

If baseline drift is legitimate:

```bash
REFRESH_GOLDEN=1 mise run test:e2e
```

Expect:

- missing baseline fails by default.
- refresh is explicit and auditable.

## W6: Port collision resistance

```bash
PORT=3003 ADMIN_PORT=3005 mise run test:integration:mock
PORT=3004 ADMIN_PORT=3006 mise run -f wf:crashdemo
```

Expect:

- no `EADDRINUSE` between app/admin/test lanes.
- dedicated ports isolate walkthrough and CI fanout.

## W7: Task graph truth

```bash
mise tasks deps check
```

Expect:

- readable `depends` graph.
- no hidden nested orchestration that bypasses DAG visibility.

## W8: Soak without cache illusion

```bash
mise run -f wf:crashdemo:soak
mise run -f test:unit:soak
```

Expect:

- every iteration executes real work.
- failures represent true nondeterminism, not cache artifacts.

## W9: DBOS status verification (SQL-first)

```bash
mise run dbos:workflow:list
mise run dbos:workflow:status -- <workflow_id>
```

If CLI presentation is ambiguous, use direct SQL against `dbos.workflow_status`.

## W10: Incident replay checklist (I01..I19)

Run in order:

```bash
mise run quick
mise run check
mise run -f check
mise run -f test:e2e
PORT=3003 ADMIN_PORT=3005 mise run test:integration:mock
PORT=3004 ADMIN_PORT=3006 mise run -f wf:crashdemo
```

Pass criteria:

- no port collisions.
- no cache-skipped sign-off paths.
- no golden self-heal.
- no 500 for parse errors.
- DB invariant preserved.
