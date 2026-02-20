# 006 Spec-06 Live UI/API Operator Course (As-Built 2026-02-20)

## 0) Doctrine (hard law, no negotiation)

- Objective: extract real value from shipped surface now: `UI(/) + /api/** + SQL oracle + durability`.
- Truth: SQL rows (`app.*`, `dbos.workflow_status`) are truth; logs are hints.
- Identity law: `workflowID=intentId`; duplicate start is idempotent success.
- Step law: `CompileST|ApplyPatchST|DecideST|ExecuteST` only.
- Queue law: parent on `intentQ`; child fanout on `sbxQ`.
- Partition law: with `SBX_QUEUE_PARTITION=true` (default), parent start requires non-blank `queuePartitionKey`.
- Contract law: malformed JSON/schema/policy -> deterministic `400` + zero writes.
- Release law: `quick && check && full` + forced soaks (`-f`) before signoff claims.

## 1) Reality Envelope (what exists today)

- Primary product surface: Next App Router `app/page.tsx` + `app/api/**/route.ts`.
- Compatibility surface still present: legacy `/intents`, `/runs/:id`, etc.
- UI states are explicit: `loading|error|empty|running|terminal`.
- UI status enum: `ENQUEUED|PENDING|SUCCESS|ERROR|CANCELLED|MAX_RECOVERY_ATTEMPTS_EXCEEDED`.
- HITL gate exists: `nextAction=APPROVE_PLAN` + `POST /api/runs/:wid/approve-plan`.
- ChatInput strict-mode behavior: UI start now sends deterministic default `queuePartitionKey=ui-default`; API path remains preferred for custom tenant partitioning.

## 2) Tracks (pick one, run all steps in order)

- PO fast demo (10-15m): `L00 -> L01D -> L03 -> L04 -> L05 -> L18`.
- QA contract/durability (35-50m): `L00 -> L01S -> L02 -> L03 -> L06 -> L07 -> L08 -> L09 -> L13 -> L18`.
- FDE release rehearsal (45-70m): `L00 -> L01S -> L03 -> L10 -> L11 -> L12 -> L14 -> L15 -> L16 -> L17 -> L18`.

## 3) Shell Kit (copy once)

```bash
BASE=http://127.0.0.1:3000
term='SUCCESS|ERROR|CANCELLED|MAX_RECOVERY_ATTEMPTS_EXCEEDED'
wait_terminal(){ wid="$1"; for i in $(seq 1 240); do s=$(curl -sS "$BASE/api/runs/$wid" | jq -r .status); echo "$s"; echo "$s" | grep -Eq "$term" && return 0; sleep 0.5; done; return 1; }
wait_approve(){ wid="$1"; for i in $(seq 1 240); do a=$(curl -sS "$BASE/api/runs/$wid" | jq -r '.nextAction // empty'); [ "$a" = "APPROVE_PLAN" ] && return 0; sleep 0.5; done; return 1; }
sql_app(){ docker compose exec -T db psql -U "${DB_USER:-postgres}" -d "${APP_DB_NAME:-app_local}" -c "$1"; }
sql_sys(){ scripts/db/psql-sys.sh -c "$1"; }
```

## 4) Labs

### L00 Baseline reset + deterministic floor

```bash
mise install
mise run db:up
mise run db:reset
mise run db:sys:reset
mise run quick
```

Pass: quick green; DB clean; policy green.

### L01S Start strict mode (signoff posture)

```bash
PORT=3000 ADMIN_PORT=3002 OC_MODE=replay SBX_MODE=mock SBX_QUEUE_PARTITION=true pnpm dev:ui
```

```bash
curl -sS "$BASE/api/runs/not_found" | jq
```

Pass: UI loads on `/`; `/api` live; strict partition law active.

### L01D Start demo mode (PO shortcut; non-signoff)

```bash
PORT=3000 ADMIN_PORT=3002 OC_MODE=replay SBX_MODE=mock SBX_QUEUE_PARTITION=false pnpm dev:ui
```

Pass: ChatInput starts with relaxed partition policy (non-signoff mode).

### L02 Strict bootstrap via API (recommended start path)

```bash
INTENT=$(curl -sS -X POST "$BASE/api/intents" -H 'content-type: application/json' -d '{"goal":"spec06 strict demo","inputs":{},"constraints":{}}' | jq -r .intentId)
WID=$(curl -sS -X POST "$BASE/api/runs" -H 'content-type: application/json' -d "{\"intentId\":\"$INTENT\",\"recipeName\":\"compile-default\",\"queuePartitionKey\":\"tenant-spec06\"}" | jq -r .workflowID)
echo "$INTENT $WID"
curl -sS "$BASE/api/runs/$WID" | jq '{workflowID,status,nextAction,traceId}'
```

Pass: `workflowID` exists, status in strict enum set.

### L03 HITL approval gate -> terminal convergence

```bash
wait_approve "$WID"
curl -sS "$BASE/api/runs/$WID" | jq '{status,nextAction}'
curl -sS -X POST "$BASE/api/runs/$WID/approve-plan" -H 'content-type: application/json' -d '{"approvedBy":"tutorial","notes":"gate-open"}' | jq
wait_terminal "$WID"
curl -sS "$BASE/api/runs/$WID" | jq '{status,nextAction,error}'
```

Pass: approval accepted, run reaches terminal.

### L04 UI walkthrough (`/?wid=<id>`)

Open `http://127.0.0.1:3000/?wid=$WID`.

Expected:

- Durability banner visible.
- Header status + copyable workflowID visible.
- Step rows stable-order by `startedAt` then `stepID`.
- Terminal card appears, poller stops after terminal.

### L05 Artifact drill (API + viewer)

```bash
curl -sS "$BASE/api/runs/$WID/steps" | jq 'map({stepID,attempt,artifacts:(.artifactRefs|length)})'
ART=$(curl -sS "$BASE/api/runs/$WID/steps" | jq -r 'map(.artifactRefs[]) | .[0].id')
AENC=$(printf '%s' "$ART" | jq -sRr @uri)
curl -sS -D /tmp/006-art.h "$BASE/api/artifacts/$AENC" -o /tmp/006-art.body
sed -n '1,20p' /tmp/006-art.h
```

Pass: deterministic content-type; steps expose artifact refs; `none` sentinel may appear.

### L06 Fail-closed ingress matrix

```bash
curl -sS -o /tmp/006-bad-json.out -w '%{http_code}\n' -X POST "$BASE/api/intents" -H 'content-type: application/json' -d '{bad'
curl -sS -o /tmp/006-extra-field.out -w '%{http_code}\n' -X POST "$BASE/api/runs" -H 'content-type: application/json' -d "{\"intentId\":\"$INTENT\",\"queuePartitionKey\":\"tenant-spec06\",\"bogus\":1}"
curl -sS -o /tmp/006-steps-404.out -w '%{http_code}\n' "$BASE/api/runs/not_real/steps"
```

Pass: `400`, `400`, `404` respectively.

### L07 Zero-write proof on policy reject

```bash
B=$(docker compose exec -T db psql -tA -U "${DB_USER:-postgres}" -d "${APP_DB_NAME:-app_local}" -c "SELECT COUNT(*) FROM app.runs;" | tr -d '\r' | xargs)
curl -sS -o /tmp/006-no-partition.out -w '%{http_code}\n' -X POST "$BASE/api/runs" -H 'content-type: application/json' -d "{\"intentId\":\"$INTENT\",\"recipeName\":\"compile-default\"}"
A=$(docker compose exec -T db psql -tA -U "${DB_USER:-postgres}" -d "${APP_DB_NAME:-app_local}" -c "SELECT COUNT(*) FROM app.runs;" | tr -d '\r' | xargs)
echo "before=$B after=$A"
```

Pass: HTTP `400`, `before==after`.

### L08 SQL projection audit (timeline vs durable rows)

```bash
sql_app "SELECT id,status,workflow_id FROM app.runs WHERE workflow_id='$WID';"
sql_app "SELECT step_id,attempt,phase,started_at,finished_at FROM app.run_steps WHERE run_id=(SELECT id FROM app.runs WHERE workflow_id='$WID') ORDER BY started_at,step_id,attempt;"
sql_app "SELECT step_id,attempt,COUNT(*) c FROM app.artifacts WHERE run_id=(SELECT id FROM app.runs WHERE workflow_id='$WID') GROUP BY step_id,attempt ORDER BY step_id,attempt;"
sql_app "SELECT COUNT(*) none_artifacts FROM app.artifacts WHERE run_id=(SELECT id FROM app.runs WHERE workflow_id='$WID') AND kind='none';"
```

Pass: step/attempt history append-only; artifacts present for each visible step.

### L09 Exactly-once SQL checks

```bash
sql_app "SELECT COUNT(*) dup_receipts FROM app.mock_receipts WHERE seen_count>1;"
sql_app "SELECT COUNT(*) dup_task_attempt FROM (SELECT run_id,step_id,task_key,attempt,COUNT(*) c FROM app.sbx_runs GROUP BY run_id,step_id,task_key,attempt HAVING COUNT(*)>1) d;"
```

Pass: both `0`.

### L10 Split topology parity (shim+worker)

Terminal A:

```bash
OC_SERVER_PORT=4096 scripts/oc-daemon-stop.sh >/dev/null 2>&1 || true
OC_SERVER_PORT=4096 scripts/oc-daemon-start.sh
```

Terminal B:

```bash
PORT=3011 ADMIN_PORT=3012 DBOS__APPVERSION=v1 OC_MODE=live OC_BASE_URL=http://127.0.0.1:4096 pnpm dev:api-shim
```

Terminal C:

```bash
PORT=3011 ADMIN_PORT=3012 DBOS__APPVERSION=v1 OC_MODE=live OC_BASE_URL=http://127.0.0.1:4096 SBX_MODE=mock pnpm dev:worker
```

Terminal D:

```bash
BASE=http://127.0.0.1:3011
curl -sS "$BASE/healthz" | jq
```

Pass: shim serves API, worker drains queues, shared `DBOS__APPVERSION` required.

### L11 Durability kill/restart harness (single command proof)

```bash
mise run db:reset
mise run db:sys:reset
PORT=3013 ADMIN_PORT=3014 SBX_MODE=mock OC_MODE=live scripts/wf-ui-durability.sh
```

Pass: script ends `OK workflow=<wid> verified via /api`.

### L12 Queue stress proofs (partition + rate)

```bash
mise run test:integration:mock:file test/integration/queue-partition-fairness.test.ts
mise run test:integration:mock:file test/integration/queue-rate-limit.test.ts
```

Pass: both green.

### L13 E2E/FE contract packs

```bash
mise run test:fe
mise run test:e2e:file test/e2e/run-view-golden.test.ts
mise run test:e2e
```

Pass: UI contracts + golden + E2E green.

### L14 OTLP + trace-link surface

```bash
DBOS_ENABLE_OTLP=true TRACE_BASE_URL='http://localhost:16686/trace/{traceId}' pnpm exec tsx scripts/otlp-smoke.ts
pnpm exec vitest run test/unit/trace-link.test.ts --config vitest.config.ts
```

Pass: OTLP smoke green; trace URL builder null-safe.

### L15 Full gates + forced soaks (ship bar)

```bash
mise run quick
mise run check
mise run full
mise run -f wf:intent:chaos:soak
mise run -f sandbox:fanout:soak
```

Pass: all green.

### L16 Live integrations smoke (real providers)

```bash
OC_STRICT_MODE=1 OC_MODE=live mise run oc:live:smoke
SBX_MODE=live SBX_PROVIDER=e2b mise run sbx:live:smoke
SBX_MODE=live SBX_PROVIDER=microsandbox SBX_ALT_PROVIDER_ENABLED=true mise run sbx:live:smoke
```

Pass: live smoke lanes behave as expected (including deterministic unsupported paths).

### L17 Release decision + rollback trigger rehearsal

```bash
cat spec-0/06/release-decision.json | jq
```

Ship only if:

- `quick/check/full` + forced soaks all green.
- SQL dup checks remain zero.
- timeline terminal state matches durable row after restart.

Rollback immediately if:

- duplicate side-effects (`mock_receipts`/`sbx_runs`) appear.
- terminal timeline diverges from durable status.
- policy self-test passes known-bad fixtures (false-green).

### L18 Compact signoff snapshot (single-screen handoff)

```bash
sql_app "SELECT status,COUNT(*) FROM app.runs GROUP BY status ORDER BY status;"
sql_app "SELECT step_id,COUNT(*) FROM app.run_steps GROUP BY step_id ORDER BY step_id;"
sql_app "SELECT kind,COUNT(*) FROM app.artifacts GROUP BY kind ORDER BY kind;"
sql_sys "SELECT queue_name,COUNT(*) FROM dbos.workflow_status GROUP BY queue_name ORDER BY queue_name;"
```

Pass: coherent run/step/artifact distributions; queue topology looks sane.

## 5) Scenario Bank (fast what-if drills)

- Scenario A (`strict-start-fails`): omit `queuePartitionKey` in strict mode. Expect `400`, zero writes (`L07`).
- Scenario B (`chat-demo`): run `L01D`; start via UI only; verify terminal + artifacts (`L03-L05`).
- Scenario C (`manual-hitl`): poll until `APPROVE_PLAN`, pause 30s, approve, verify resume (`L03`).
- Scenario D (`unknown-wid`): `GET /api/runs/not_real` + `/steps`; expect deterministic `404`.
- Scenario E (`artifact-id-with-slashes`): fetch first artifact id via `/steps`, URL-encode, stream via `/api/artifacts/:id`.
- Scenario F (`restart-mid-execute`): run durability harness `L11`, validate same workflowID convergence.
- Scenario G (`split-topology-mismatch`): intentionally mismatch `DBOS__APPVERSION`; observe stuck queue; fix parity.
- Scenario H (`trace-link-null-safe`): unset `TRACE_BASE_URL`; UI must omit broken trace links.

## 6) Triage (symptom -> first check)

- `POST /api/runs = 400`: missing/blank `queuePartitionKey` (strict), bad recipe, or caps violation.
- ChatInput no-op in strict mode: expected; use `L02` or disable partition for demo only.
- timeline empty: check `GET /api/runs/:wid` first, then worker/DB health, then DB row existence.
- approval accepted but no progress: workflow not in `waiting_input`, worker down, or OC unreachable in live mode.
- duplicate-side-effect alarm: run `L09`; rollback if non-zero.
- random flake suspicion: rerun only with forced lanes (`mise run -f ...`), never by ad-hoc retries.

## 7) Non-Goals (do not do this)

- Do not claim signoff from demo mode (`SBX_QUEUE_PARTITION=false`).
- Do not use logs as proof when SQL oracle exists.
- Do not move parent workflow to `sbxQ`.
- Do not patch with retries/timeouts as primary fix.
- Do not widen API envelopes beyond contract schemas.
