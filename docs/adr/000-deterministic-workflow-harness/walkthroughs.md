# ADR 000 Companion: Walkthroughs

## W1: Happy path (local correctness gradient)

```bash
mise install
mise run quick
```

Readout:

- format/lint/type/unit pass.
- deterministic guardrails active: seeded RNG + frozen unit clock + net deny except localhost.

## W2: Crash-resume demonstration (single run)

```bash
mise run db:reset
mise run build
mise run -f wf:crashdemo
```

Internal flow:

1. start proc-1.
2. enqueue `wf_crashdemo_fixed`.
3. write `s1`.
4. `kill -9` proc-1.
5. start proc-2; `resumeIncomplete()`.
6. write `s2`; set `completed=true`.
7. assert DB counts until `{s1:1,s2:1}`.

## W3: Soak (repeat durability, no cache)

```bash
mise run wf:crashdemo:soak
```

Contract:

- script loops 20x.
- each loop invokes `mise run -f wf:crashdemo`.
- pass criteria: 20/20 marker invariants.

## W4: Idempotency (same workflow id, no duplicate effects)

```ts
await workflow.trigger(wf);
await workflow.trigger(wf);
await workflow.waitUntilComplete(wf);
expect(await workflow.marks(wf)).toEqual({ s1: 1, s2: 1 });
```

Reason:

- duplicate trigger converges via PK + conflict-safe inserts.

## W5: OC replay determinism

```ts
const key = fixtureKey(intent, schemaVersion, seed); // sha256(canonical json)
const payload = read fixtures/oc/${key}.json;
assertOCOutput(payload); // AJV strict schema gate
```

Modes:

- `replay`: offline deterministic default.
- `record`: persist new fixture.
- `live`: producer call, still schema-checked.

## W6: SBX mode split

Mock mode:

```json
{ "exitCode": 0, "stdout": "OK\n", "files": { "out.json": "{}" } }
```

Live mode:

- executes configured shell command.
- normalizes newlines.
- canonicalizes artifact-file map ordering.

## W7: CI parity

```yaml
quick: mise run ci:quick # push/PR
full: mise run ci:full # scheduled
```

No bespoke CI shell DAG; same `mise` truth surface as local.
