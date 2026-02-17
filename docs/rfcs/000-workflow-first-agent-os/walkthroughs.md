# RFC 000 Walkthroughs (Dense)

## W1 Happy-path (intent -> artifacts)

Input:

```json
{
  "goal": "compare 3 vendors",
  "inputs": { "urls": ["a.com", "b.com", "c.com"] },
  "constraints": { "budgetUsd": 200 }
}
```

Flow:

1. `POST /intents` stores canonical payload hash.
2. `POST /intents/:id/run` enqueues `RunIntent`.
3. `CompileST` returns schema-valid `Plan+Patch+Tests`.
4. `ApplyPatchST` writes patch; records diff artifact.
5. `ExecuteST` fan-outs vendor fetch/extract in `sandboxQ`.
6. Aggregation step emits `comparison.csv`, `summary.md`, `decision.json`.
7. Timeline shows step durations, retries=0, trace links.

Output invariants:

- exactly one `runs.workflow_id` row.
- one or more artifacts per executed step (or explicit `none`).
- deterministic `RunViewModel` serialization.

## W2 Crash-resume mid-run (worker kill)

Scenario: kill worker after `s1`, before `s2`.

Expected:

- on restart, resume scans incomplete workflows.
- `s1` marker count remains `1`.
- `s2` executes once, marker count `1`.
- no duplicate side effects because `(run_id, step_id)` PK + conflict-safe writes.

Verification query:

```sql
SELECT step, count(*) FROM app.marks WHERE run_id=$1 GROUP BY step;
-- must settle at s1=1,s2=1
```

## W3 Human approval gate

Plan contains:

- `generate_draft`
- `approval_gate(send_email)`
- `dispatch_email`

Runtime:

1. WF emits `question_card` artifact with enum `{approve,reject}`.
2. WF enters `waiting_input`.
3. UI posts `POST /runs/:id/events` with signed payload.
4. WF resumes same `run_id`; branch chosen from persisted decision output.

Timeout branch example:

```json
{ "event": "approval_timeout", "action": "cancel_and_notify" }
```

## W4 Patch + replay from failed step

Failure: `ExecuteST(step=transform_csv)` exits non-zero.

Recovery:

1. `FixST` prompts OC with failure artifact set.
2. patch applied in isolated ST.
3. `POST /runs/:id/retry {"fromStep":"transform_csv"}` creates new run lineage.
4. completed prior steps can be reused if replay policy says "trusted".

Lineage model:

```txt
run-A (failed@transform_csv)
  -> run-B (retry-from transform_csv, parent=run-A)
```

## W5 100-task fan-out

Parent step `batch_extract` emits 100 child jobs to `sandboxQ`.

Controls:

- recipe cap `maxConcurrency=20`
- queue priority `sandboxQ:normal`
- per-child timeout `90s`

Join policy:

- parent waits on handles.
- collect successes + failures as separate artifact lists.
- terminal status:
  - `succeeded` if `failures <= tolerance`
  - `failed` otherwise.

## W6 OC unavailable

If OC service health fails during `CompileST`:

- retry bounded (`N=3`, jitter controlled in ST wrapper).
- if exhausted, WF status `failed` with cause code `OC_UNAVAILABLE`.
- user sees machine-readable failure with retry suggestion.

## W7 Sandbox drift

If template/image mismatch detected:

- step emits `env_drift` artifact.
- policy chooses `fallback_template` once.
- if still drift, hard-fail; do not silently run on host.
