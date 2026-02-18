# Walkthroughs (Dense, Oracle-First)

## W0. Bootstrap Deterministic Baseline

```bash
mise install
PORT=3001 ADMIN_PORT=3002 mise run quick
```

Pass condition: `quick` green with no policy false-green probes.

## W1. Crash Durability Oracle (`s1=1,s2=1`)

```bash
PORT=3004 ADMIN_PORT=3006 mise run -f wf:crashdemo
mise run db:query -- "SELECT step,COUNT(*) c FROM app.marks WHERE run_id=(SELECT id FROM app.workflow_runs ORDER BY started_at DESC LIMIT 1) GROUP BY step ORDER BY step"
```

Expected:

```text
s1 | 1
s2 | 1
```

## W2. Intent Product Flow (enqueue -> terminal projection)

```bash
curl -sS -X POST :3001/intents -H 'content-type: application/json' -d '{"goal":"demo"}'
curl -sS -X POST :3001/intents/<intentId>/run -H 'content-type: application/json' -d '{}'
curl -sS :3001/runs/<runId>
curl -sS :3001/runs/<workflowId>
```

Expected invariants:

- `workflowId == intentId`
- final status deterministic (`succeeded` or `retries_exceeded`), never ambiguous
- both `runId` and `workflowId` lookup paths resolve

## W3. Pre-Enqueue Queue Cap Hard-Fail

```bash
curl -i -sS -X POST :3001/intents/<intentId>/run \
  -H 'content-type: application/json' \
  -d '{"recipeId":"capped-recipe","workload":999}'
```

Expected:

- `HTTP/1.1 400`
- deterministic validation envelope
- DB write count unchanged (`app.runs` no new row)

## W4. Retry + Repair Resume From First Missing Step

```bash
curl -sS -X POST :3001/runs/<runOrWorkflowId>/retry -H 'content-type: application/json' -d '{}'
```

Expected envelope:

```json
{
  "accepted": true,
  "newRunId": "repair-<oldRunId>",
  "fromStep": "CompileST|ApplyPatchST|DecideST|ExecuteST"
}
```

SQL oracle:

```sql
SELECT step, output->>'attempt' AS attempt
FROM app.run_steps
WHERE run_id='<oldRunId>'
ORDER BY started_at;
```

## W5. HITL FSM: only `waiting_input` accepts events

```bash
curl -sS -X POST :3001/runs/<id>/events -H 'content-type: application/json' -d '{"type":"human-event","payload":{"answer":"ship"}}'
```

Expected:

- `202` only when run state is `waiting_input`
- `409` for terminal/non-waiting states
- transition `waiting_input -> running -> terminal`

## W6. Split Topology Contract (shim/worker)

```bash
mise run start:worker
mise run start:api-shim
curl -sS -X POST :3011/intents/<intentId>/run -H 'content-type: application/json' -d '{}'
```

Expected:

- shim imports no workflow internals (policy hard-fail on violation)
- worker owns workflow registration and dequeue
- shim+worker share `DBOS__APPVERSION`

## W7. Forced-Rerun Durability Proofline

```bash
mise run -f wf:intent:chaos:soak
mise run -f sandbox:soak
mise run check
mise run full
```

Credibility rule: all four must pass in same session; partial green is non-proof.

## W8. Policy Self-Verification (anti-false-green)

```bash
mise run -f policy:shim-blackbox
mise run -f policy:wf-purity
mise run -f policy:task-sources
```

Expected:

- synthetic bad fixture fails detector
- synthetic good fixture passes
- detector drift cannot silently green
