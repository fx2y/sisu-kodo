# 002 Proof-First Operator Course (Current Build)

## 0) Use This, Not Vibes

Goal: extract real value from shipped surface (`/intents`,`/intents/:id/run`,`/runs/:id`) with DB-proven durability + deterministic tests.

Do not claim: autonomous agent runtime, real OC provider, real SBX microVM.

Hard stance:

- `mise` only.
- DB truth > logs.
- fail-closed > retries.
- cache bypass (`-f`) for soak/repeats.

## 1) Reality Envelope (as of 2026-02-17)

Works now:

- Intent ingestion + run trigger + run projection.
- Crash-resume durability proof (`marks s1=1,s2=1` + DBOS `SUCCESS`).
- Deterministic e2e + golden run-view.

Partial by design:

- `oc:live:smoke` = contract stub.
- `sbx:live:smoke` = shell adapter.
- DBOS SDK active; app authority remains explicit PG-backed contracts + repos.

## 2) 7-Minute Fast Path (PO demo)

```bash
mise install
mise run db:reset
mise run db:sys:reset
mise run build
PORT=3004 mise run -f wf:crashdemo
```

Pass oracle:

- command exits `0`.
- script prints `DBOS workflow status: SUCCESS`.
- internal assertion confirms `app.marks` reached exactly `{s1:1,s2:1}`.

Then:

```bash
mise run check
mise run test:e2e
```

If all green: implementation is demoable + regression-guarded.

## 3) Walkthrough A: Clean Bootstrap (deterministic baseline)

```bash
mise install
mise run db:up
mise run db:reset
mise run db:sys:reset
mise run build
mise run quick
```

Why this exact order:

- eliminates app/sys schema drift.
- compiles before runtime probes.
- runs policy gates early (Ajv density/task metadata/no bundlers/no dbos DDL leakage).

## 4) Walkthrough B: Durability Under `kill -9`

Single command path:

```bash
PORT=3004 ADMIN_PORT=3006 mise run -f wf:crashdemo
```

What it does (important tacit detail):

1. starts app.
2. triggers `/crashdemo?wf=<unique>`.
3. kills process hard.
4. restarts app.
5. waits until DB marks converge.
6. verifies system-table status.

Independent proof queries:

```bash
# recent system status rows
scripts/db/psql-sys.sh -c "SELECT workflow_uuid,status FROM dbos.workflow_status ORDER BY updated_at DESC LIMIT 10;"

# latest crashdemo marks (look for s1=1,s2=1)
docker compose exec -T db psql -U postgres -d app_local -c "SELECT run_id,step,COUNT(*) c FROM app.marks GROUP BY run_id,step ORDER BY run_id DESC,step;"
```

## 5) Walkthrough C: Product Flow End-to-End (real HTTP)

Terminal A:

```bash
PORT=3001 ADMIN_PORT=3002 mise run start
```

Terminal B:

```bash
BASE=http://127.0.0.1:3001
curl -sS $BASE/healthz | jq -e '.ok==true'

INTENT=$(curl -sS -X POST $BASE/intents \
  -H 'content-type: application/json' \
  -d '{"goal":"demo","inputs":{"repo":"sisu-kodo"},"constraints":{"determinism":true},"connectors":[]}' \
  | jq -r .intentId)
echo "$INTENT"

RUN=$(curl -sS -X POST $BASE/intents/$INTENT/run \
  -H 'content-type: application/json' \
  -d '{"traceId":"po-demo"}' \
  | jq -r .runId)
echo "$RUN"

for i in $(seq 1 40); do
  S=$(curl -sS $BASE/runs/$RUN | jq -r .status)
  [ "$S" = "succeeded" ] && break
  sleep 0.1
done

curl -sS $BASE/runs/$RUN | jq
```

Expected structure (stable keys):

- `runId,status,steps,artifacts,traceId`.
- `status=succeeded`.
- first step `phase=planning`.
- `traceId=po-demo`.

## 6) Walkthrough D: DB Cross-Check Product Flow

After Walkthrough C:

```bash
docker compose exec -T db psql -U postgres -d app_local -c "SELECT id,goal,created_at FROM app.intents ORDER BY created_at DESC LIMIT 3;"
docker compose exec -T db psql -U postgres -d app_local -c "SELECT id,intent_id,workflow_id,status,trace_id FROM app.runs ORDER BY created_at DESC LIMIT 3;"
docker compose exec -T db psql -U postgres -d app_local -c "SELECT run_id,step_id,phase FROM app.run_steps ORDER BY started_at DESC NULLS LAST LIMIT 5;"
```

Operator rule: API response is convenience; DB rows are source-of-truth.

## 7) Walkthrough E: Fail-Closed Ingress (syntax/schema)

Invalid JSON must be `400 invalid json`:

```bash
curl -sS -o /tmp/bad.json -w '%{http_code}\n' -X POST $BASE/intents \
  -H 'content-type: application/json' -d '{bad'
cat /tmp/bad.json
```

Invalid Intent schema must be `400` + `Intent` details:

```bash
curl -sS -o /tmp/bad-intent.json -w '%{http_code}\n' -X POST $BASE/intents \
  -H 'content-type: application/json' -d '{"inputs":{},"constraints":{}}'
cat /tmp/bad-intent.json
```

Invalid RunRequest schema must be `400` + `RunRequest` details:

```bash
curl -sS -o /tmp/bad-run.json -w '%{http_code}\n' -X POST $BASE/intents/$INTENT/run \
  -H 'content-type: application/json' -d '{"unknownField":"x"}'
cat /tmp/bad-run.json
```

Non-write guard proof:

```bash
mise run test:integration:mock
```

(contains assertions that invalid payloads do not insert intent/run rows).

## 8) Walkthrough F: Deterministic Projection + Golden

Run all e2e:

```bash
mise run test:e2e
```

Refresh golden only for intentional contract change:

```bash
mise run test:golden:refresh
```

Golden is strict (missing baseline fails); no silent auto-create.

Quick inspect:

```bash
sed -n '1,220p' test/golden/run-view.json
```

What is normalized:

- volatile IDs and ISO timestamps.

What must stay stable:

- semantic shape/order/content of RunView.

## 9) Walkthrough G: CI-Equivalent Local Gate

```bash
mise run check
mise tasks deps check
```

Required reading of output:

- `check` fanout is explicit (`quick + check:integration + check:crashdemo`).
- no hidden shell DAG.

## 10) Walkthrough H: Soak/Repeat (anti-false-green)

```bash
mise run -f wf:crashdemo:soak
mise run -f test:unit:soak
```

Non-negotiable: use `-f`; cached soak is fake soak.

## 11) Walkthrough I: DBOS Visibility + Schema Separation

System vs app schema:

```bash
scripts/db/psql-sys.sh -c '\\dt dbos.*'
docker compose exec -T db psql -U postgres -d app_local -c '\\dt app.*'
```

Workflow visibility:

```bash
mise run dbos:workflow:list
WF=$(scripts/db/psql-sys.sh -t -A -c "SELECT workflow_uuid FROM dbos.workflow_status ORDER BY updated_at DESC LIMIT 1" | xargs)
mise run dbos:workflow:status "$WF"
```

## 12) Walkthrough J: OC/SBX Reality Check (what “live” means here)

```bash
mise run oc:live:smoke
mise run sbx:live:smoke
```

Interpretation:

- passing `oc:live:smoke` proves contract path + keying, not provider integration.
- passing `sbx:live:smoke` proves shell execution adapter, not microVM isolation.

## 13) Triage Matrix (fastest credible debugging path)

`EADDRINUSE`:

```bash
PORT=3003 ADMIN_PORT=3005 mise run test:integration:mock
PORT=3004 ADMIN_PORT=3006 mise run -f wf:crashdemo
```

`wf:crashdemo` timeout:

1. `mise run build`
2. `curl -sS http://127.0.0.1:${PORT:-3001}/healthz`
3. `scripts/db/psql-sys.sh -c "SELECT workflow_uuid,status FROM dbos.workflow_status ORDER BY updated_at DESC LIMIT 5;"`
4. `docker compose exec -T db psql -U postgres -d app_local -c "SELECT run_id,step,COUNT(*) c FROM app.marks GROUP BY run_id,step ORDER BY run_id DESC,step;"`

Soak suspiciously fast:

- rerun with `mise run -f ...`.

`dbos workflow` shows nothing:

- ensure app booted at least once (`DBOS.launch` populates runtime state).
- verify `dbos-config.yaml` vars are set (`DB_HOST,DB_PORT,DB_USER,DB_PASSWORD,SYS_DB_NAME,ADMIN_PORT`).

## 14) Completion Bar (demo credibility)

Minimum pass set:

- `PORT=3004 mise run -f wf:crashdemo`
- Walkthrough C returns `status=succeeded`
- Walkthrough E returns deterministic `400`s
- `mise run test:e2e`
- `mise run check`
- `mise run -f wf:crashdemo:soak`
- `scripts/db/psql-sys.sh -c '\dt dbos.*'`

If all pass: current implementation is operationally credible for deterministic workflow/API demos.
