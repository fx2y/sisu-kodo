#!/usr/bin/env bash
set -euo pipefail

readonly UI_SCHEMA_FILES=(
  "src/contracts/ui/run-header.schema.ts"
  "src/contracts/ui/step-row.schema.ts"
  "src/contracts/ui/artifact-ref-v1.schema.ts"
)
readonly NO_TIME_DEDUPE_TARGETS=(
  "src/server/ui-api.ts"
  "src/workflow/engine-dbos.ts"
)
readonly CLOCK_DEDUPE_PATTERN='legacy-(approve|event)-[^"`]*\$\{[^}]*nowMs\(\)'
readonly REPRO_PACK_FILE="scripts/repro-pack.ts"
readonly HTTP_SHIM_FILE="src/server/http.ts"
readonly INTENT_REPO_FILE="src/db/intentRepo.ts"
readonly RUN_REPO_FILE="src/db/runRepo.ts"
readonly UI_API_FILE="src/server/ui-api.ts"
readonly DBOS_INTENT_WF_FILE="src/workflow/dbos/intentWorkflow.ts"
readonly CONFIG_FILE="src/config.ts"

has_next_response_next() {
  local target="$1"
  rg -n --glob '**/route.ts' --glob '**/route.tsx' "NextResponse\\.next\\(" "$target" >/dev/null 2>&1
}

schema_is_strict() {
  local schema_file="$1"
  [ -f "$schema_file" ] && rg -q "additionalProperties:[[:space:]]*false" "$schema_file"
}

has_clock_dedupe() {
  local target="$1"
  rg -n --glob '*.ts' -e "$CLOCK_DEDUPE_PATTERN" "$target" >/dev/null 2>&1
}

has_repro_eval_projection() {
  local target="$1"
  rg -n "evalResults: sortRows\\(evalRows" "$target" >/dev/null 2>&1
}

has_repro_eval_query() {
  local target="$1"
  rg -n "FROM app\\.eval_results" "$target" >/dev/null 2>&1
}

has_repro_workflow_events_projection() {
  local target="$1"
  rg -n "parentEvents: sortRows\\(parentEvents|childEvents: sortRows\\(childEvents" "$target" >/dev/null 2>&1
}

has_repro_workflow_events_query() {
  local target="$1"
  rg -n "FROM dbos\\.workflow_events" "$target" >/dev/null 2>&1
}

has_legacy_route_gate() {
  local target="$1"
  rg -n "enableLegacyRunRoutes" "$target" >/dev/null 2>&1
}

has_intent_hash_persistence() {
  local target="$1"
  rg -n 'INSERT INTO app\.intents \(id, goal, payload, intent_hash, recipe_id, recipe_v, recipe_hash, json\)' "$target" >/dev/null 2>&1 &&
    rg -n 'VALUES \(\$1, \$2, \$3::jsonb, \$4, \$5, \$6, \$7, \$8::jsonb\)' "$target" >/dev/null 2>&1
}

has_run_hash_persistence() {
  local target="$1"
  rg -n "INSERT INTO app\\.runs \\(id, intent_id, intent_hash, recipe_id, recipe_v, recipe_hash, workflow_id" "$target" >/dev/null 2>&1 &&
    rg -n "SELECT id, intent_id, intent_hash, recipe_id, recipe_v, recipe_hash, workflow_id" "$target" >/dev/null 2>&1
}

has_reply_waiting_lane_guard() {
  local target="$1"
  rg -n "export async function postReplyService" "$target" >/dev/null 2>&1 &&
    rg -n 'run\.status !== "waiting_input"' "$target" >/dev/null 2>&1
}

has_external_event_waiting_lane_guard() {
  local target="$1"
  rg -n "export async function postExternalEventService" "$target" >/dev/null 2>&1 &&
    rg -n 'run\.status !== "waiting_input"' "$target" >/dev/null 2>&1
}

has_workflow_send_dedupe_forwarding() {
  local target="$1"
  rg -n "sendMessage: \\(workflowId, message, topic, _dedupeKey\\) =>" "$target" >/dev/null 2>&1 &&
    rg -n "DBOS\\.send\\(workflowId, message, topic\\)" "$target" >/dev/null 2>&1
}

has_forbidden_process_env_write() {
  local target="$1"
  if [ -d "$target" ]; then
    rg -n --glob '*.ts' 'process\.env\.[A-Z0-9_]+\s*=' "$target" \
      -g '!**/src/config.ts' >/dev/null 2>&1
    return
  fi
  rg -n 'process\.env\.[A-Z0-9_]+\s*=' "$target" >/dev/null 2>&1
}

run_self_test() {
  local tmp bad_dir good_dir
  tmp="$(mktemp -d)"
  bad_dir="$tmp/bad"
  good_dir="$tmp/good"
  trap 'rm -rf "$tmp"' RETURN

  mkdir -p "$bad_dir/app/api/demo" "$good_dir/app/api/demo"
  cat >"$bad_dir/app/api/demo/route.ts" <<'TS'
import { NextResponse } from "next/server";
export async function GET() {
  return NextResponse.next();
}
TS
  if ! has_next_response_next "$bad_dir"; then
    echo "boundary-gates self-test failed: expected NextResponse.next() detector to fail." >&2
    exit 1
  fi

  cat >"$good_dir/app/api/demo/route.ts" <<'TS'
export async function GET() {
  return Response.json({ ok: true });
}
TS
  if has_next_response_next "$good_dir"; then
    echo "boundary-gates self-test failed: NextResponse.next() detector false-positive." >&2
    exit 1
  fi

  cat >"$tmp/good-schema.ts" <<'TS'
const schema = {
  type: "object",
  additionalProperties: false
};
TS
  if ! schema_is_strict "$tmp/good-schema.ts"; then
    echo "boundary-gates self-test failed: expected strict schema to pass." >&2
    exit 1
  fi

  cat >"$tmp/bad-schema.ts" <<'TS'
const schema = {
  type: "object",
  additionalProperties: true
};
TS
  if schema_is_strict "$tmp/bad-schema.ts"; then
    echo "boundary-gates self-test failed: expected non-strict schema to fail." >&2
    exit 1
  fi

  cat >"$bad_dir/dedupe.ts" <<'TS'
import { nowMs } from "../../src/lib/time";
const runId = "r1";
const dedupeKey = `legacy-approve-${runId}-${nowMs()}`;
void dedupeKey;
TS
  if ! has_clock_dedupe "$bad_dir"; then
    echo "boundary-gates self-test failed: expected clock dedupe detector to fail." >&2
    exit 1
  fi

  cat >"$good_dir/dedupe.ts" <<'TS'
const dedupeKey = "legacy-approve:stable-hash";
void dedupeKey;
TS
  if has_clock_dedupe "$good_dir"; then
    echo "boundary-gates self-test failed: clock dedupe detector false-positive." >&2
    exit 1
  fi

  cat >"$bad_dir/repro-pack.ts" <<'TS'
const snapshot = { run: {} };
void snapshot;
TS
  if has_repro_eval_projection "$bad_dir/repro-pack.ts"; then
    echo "boundary-gates self-test failed: repro eval projection detector false-positive." >&2
    exit 1
  fi

  cat >"$good_dir/repro-pack.ts" <<'TS'
const evalRows = [];
const snapshot = { evalResults: sortRows(evalRows, ["check_id", "created_at"]) };
void snapshot;
TS
  if ! has_repro_eval_projection "$good_dir/repro-pack.ts"; then
    echo "boundary-gates self-test failed: expected repro eval projection detector to pass." >&2
    exit 1
  fi

  cat >"$bad_dir/repro-pack-events.ts" <<'TS'
const snapshot = { dbos: { parentStatuses: [] } };
void snapshot;
TS
  if has_repro_workflow_events_projection "$bad_dir/repro-pack-events.ts"; then
    echo "boundary-gates self-test failed: repro workflow_events projection detector false-positive." >&2
    exit 1
  fi
  if has_repro_workflow_events_query "$bad_dir/repro-pack-events.ts"; then
    echo "boundary-gates self-test failed: repro workflow_events query detector false-positive." >&2
    exit 1
  fi

  cat >"$good_dir/repro-pack-events.ts" <<'TS'
const parentEvents = [];
const childEvents = [];
const sql = "SELECT to_jsonb(e) AS row FROM dbos.workflow_events e WHERE e.workflow_uuid = $1";
const snapshot = { dbos: { parentEvents: sortRows(parentEvents, ["workflow_uuid", "key"]), childEvents: sortRows(childEvents, ["workflow_uuid", "key"]) } };
void sql; void snapshot;
TS
  if ! has_repro_workflow_events_projection "$good_dir/repro-pack-events.ts"; then
    echo "boundary-gates self-test failed: expected repro workflow_events projection detector to pass." >&2
    exit 1
  fi
  if ! has_repro_workflow_events_query "$good_dir/repro-pack-events.ts"; then
    echo "boundary-gates self-test failed: expected repro workflow_events query detector to pass." >&2
    exit 1
  fi

  cat >"$bad_dir/http.ts" <<'TS'
if (req.method === "POST" && path === "/runs/demo/approve-plan") { return; }
TS
  if has_legacy_route_gate "$bad_dir/http.ts"; then
    echo "boundary-gates self-test failed: legacy route gate detector false-positive." >&2
    exit 1
  fi

  cat >"$good_dir/http.ts" <<'TS'
if (!cfg.enableLegacyRunRoutes) { return; }
TS
  if ! has_legacy_route_gate "$good_dir/http.ts"; then
    echo "boundary-gates self-test failed: expected legacy route gate detector to pass." >&2
    exit 1
  fi

  cat >"$bad_dir/intentRepo.ts" <<'TS'
const sql = `INSERT INTO app.intents (id, goal, payload) VALUES ($1,$2,$3)`;
void sql;
TS
  if has_intent_hash_persistence "$bad_dir/intentRepo.ts"; then
    echo "boundary-gates self-test failed: intent hash persistence detector false-positive." >&2
    exit 1
  fi
  cat >"$good_dir/intentRepo.ts" <<'TS'
const sql = `INSERT INTO app.intents (id, goal, payload, intent_hash, recipe_id, recipe_v, recipe_hash, json)
VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7, $8::jsonb)`;
void sql;
TS
  if ! has_intent_hash_persistence "$good_dir/intentRepo.ts"; then
    echo "boundary-gates self-test failed: expected intent hash persistence detector to pass." >&2
    exit 1
  fi

  cat >"$bad_dir/runRepo.ts" <<'TS'
const a = `INSERT INTO app.runs (id, intent_id, workflow_id) VALUES ($1,$2,$3)`;
const b = `SELECT id, intent_id, workflow_id FROM app.runs`;
void a; void b;
TS
  if has_run_hash_persistence "$bad_dir/runRepo.ts"; then
    echo "boundary-gates self-test failed: run hash persistence detector false-positive." >&2
    exit 1
  fi
  cat >"$good_dir/runRepo.ts" <<'TS'
const a = `INSERT INTO app.runs (id, intent_id, intent_hash, recipe_id, recipe_v, recipe_hash, workflow_id) VALUES ($1,$2,$3,$4,$5,$6,$7)`;
const b = `SELECT id, intent_id, intent_hash, recipe_id, recipe_v, recipe_hash, workflow_id FROM app.runs`;
void a; void b;
TS
  if ! has_run_hash_persistence "$good_dir/runRepo.ts"; then
    echo "boundary-gates self-test failed: expected run hash persistence detector to pass." >&2
    exit 1
  fi

  cat >"$bad_dir/ui-api.ts" <<'TS'
export async function postReplyService() {}
export async function postExternalEventService() {}
TS
  if has_reply_waiting_lane_guard "$bad_dir/ui-api.ts"; then
    echo "boundary-gates self-test failed: reply waiting-lane detector false-positive." >&2
    exit 1
  fi
  if has_external_event_waiting_lane_guard "$bad_dir/ui-api.ts"; then
    echo "boundary-gates self-test failed: external-event waiting-lane detector false-positive." >&2
    exit 1
  fi
  cat >"$good_dir/ui-api.ts" <<'TS'
export async function postExternalEventService() {
  if (run.status !== "waiting_input") throw new Error("x");
}
export async function postReplyService() {
  if (run.status !== "waiting_input") throw new Error("x");
}
TS
  if ! has_reply_waiting_lane_guard "$good_dir/ui-api.ts"; then
    echo "boundary-gates self-test failed: expected reply waiting-lane detector to pass." >&2
    exit 1
  fi
  if ! has_external_event_waiting_lane_guard "$good_dir/ui-api.ts"; then
    echo "boundary-gates self-test failed: expected external-event waiting-lane detector to pass." >&2
    exit 1
  fi

  cat >"$bad_dir/intentWorkflow.ts" <<'TS'
sendMessage: (workflowId, message, topic, dedupeKey) => DBOS.send(workflowId, message, topic)
TS
  if has_workflow_send_dedupe_forwarding "$bad_dir/intentWorkflow.ts"; then
    echo "boundary-gates self-test failed: DBOS.send dedupe forwarding detector false-positive." >&2
    exit 1
  fi
  cat >"$good_dir/intentWorkflow.ts" <<'TS'
sendMessage: (workflowId, message, topic, _dedupeKey) => DBOS.send(workflowId, message, topic)
TS
  if ! has_workflow_send_dedupe_forwarding "$good_dir/intentWorkflow.ts"; then
    echo "boundary-gates self-test failed: expected DBOS.send dedupe forwarding detector to pass." >&2
    exit 1
  fi

  mkdir -p "$bad_dir/src/lib" "$good_dir/src"
  cat >"$bad_dir/src/lib/otlp.ts" <<'TS'
process.env.OTEL_SERVICE_NAME = "svc";
TS
  if ! has_forbidden_process_env_write "$bad_dir/src"; then
    echo "boundary-gates self-test failed: expected process.env write detector to fail bad fixture." >&2
    exit 1
  fi
  cat >"$good_dir/src/config.ts" <<'TS'
process.env.OTEL_SERVICE_NAME = "svc";
TS
  if has_forbidden_process_env_write "$good_dir/src"; then
    echo "boundary-gates self-test failed: process.env write detector false-positive on config.ts exception." >&2
    exit 1
  fi
}

run_policy_checks() {
  local bad=0

  if [ ! -f test/golden/run-view.json ]; then
    echo "missing deterministic golden baseline: test/golden/run-view.json" >&2
    bad=1
  fi

  if ! rg -q "const workflowId = intentId;" src/workflow/start-intent.ts; then
    echo "workflow identity drift: start-intent must enforce workflowID=intentId" >&2
    bad=1
  fi

  if ! rg -q "duplicate side effect receipt detected" src/workflow/steps/run-intent.steps.ts; then
    echo "missing duplicate-side-effect guard in ExecuteST path" >&2
    bad=1
  fi

  if ! rg -q "\\[tasks\\.\"wf:intent:chaos:soak\"\\]" mise.toml; then
    echo "missing forced-rerun intent chaos soak task" >&2
    bad=1
  fi

  if ! rg -q "\\[tasks\\.\"sandbox:soak\"\\]" mise.toml; then
    echo "missing sandbox parallel soak task" >&2
    bad=1
  fi

  if ! rg -q "\\[tasks\\.\"wf:crashdemo\"\\]" mise.toml; then
    echo "legacy canary removed: wf:crashdemo task must remain" >&2
    bad=1
  fi

  if [ ! -f test/integration/oc-bug-8528.test.ts ] || [ ! -f test/integration/oc-bug-6396.test.ts ] || [ ! -f test/integration/oc-bug-11064.test.ts ]; then
    echo "missing mandatory bug regression suites (Bet E)" >&2
    bad=1
  fi

  if ! rg -q 'code !== "oc_stall"' src/oc/timeout-policy.ts; then
    echo "missing stall detector timeout policy guard" >&2
    bad=1
  fi

  if ! rg -q 'oc_timeout_terminal' src/oc/timeout-policy.ts; then
    echo "missing terminal timeout policy in OC timeout module" >&2
    bad=1
  fi

  if [ -d app ] && has_next_response_next app; then
    echo "forbidden Next.js primitive: NextResponse.next() must not be used in route handlers" >&2
    bad=1
  fi

  for schema_file in "${UI_SCHEMA_FILES[@]}"; do
    if ! schema_is_strict "$schema_file"; then
      echo "schema drift guard: $schema_file must enforce additionalProperties: false" >&2
      bad=1
    fi
  done

  for dedupe_file in "${NO_TIME_DEDUPE_TARGETS[@]}"; do
    if has_clock_dedupe "$dedupe_file"; then
      echo "clock-derived dedupe key is forbidden: $dedupe_file" >&2
      rg -n --glob '*.ts' -e "$CLOCK_DEDUPE_PATTERN" "$dedupe_file" >&2 || true
      bad=1
    fi
  done

  if ! has_repro_eval_projection "$REPRO_PACK_FILE"; then
    echo "repro-pack completeness drift: missing evalResults projection" >&2
    bad=1
  fi

  if ! has_repro_eval_query "$REPRO_PACK_FILE"; then
    echo "repro-pack completeness drift: missing app.eval_results query" >&2
    bad=1
  fi

  if ! has_repro_workflow_events_projection "$REPRO_PACK_FILE"; then
    echo "repro-pack completeness drift: missing dbos.workflow_events projection" >&2
    bad=1
  fi

  if ! has_repro_workflow_events_query "$REPRO_PACK_FILE"; then
    echo "repro-pack completeness drift: missing dbos.workflow_events query" >&2
    bad=1
  fi

  if ! has_legacy_route_gate "$HTTP_SHIM_FILE"; then
    echo "legacy route drift: /intents/:id/run and /runs/:id/approve-plan must be compat-gated" >&2
    bad=1
  fi

  if ! has_intent_hash_persistence "$INTENT_REPO_FILE"; then
    echo "intent hash persistence drift: app.intents hash/ref/json columns not persisted on hash upsert path" >&2
    bad=1
  fi

  if ! has_run_hash_persistence "$RUN_REPO_FILE"; then
    echo "run hash persistence drift: app.runs hash/ref cols missing from insert/select paths" >&2
    bad=1
  fi

  if ! has_reply_waiting_lane_guard "$UI_API_FILE"; then
    echo "HITL reply ingress drift: missing waiting_input lane guard" >&2
    bad=1
  fi

  if ! has_external_event_waiting_lane_guard "$UI_API_FILE"; then
    echo "HITL external-event ingress drift: missing waiting_input lane guard" >&2
    bad=1
  fi

  if ! has_workflow_send_dedupe_forwarding "$DBOS_INTENT_WF_FILE"; then
    echo "workflow adapter drift: DBOS.send dedupeKey not forwarded in workflow context" >&2
    bad=1
  fi

  if has_forbidden_process_env_write "src"; then
    echo "env ingress drift: process.env writes are forbidden outside $CONFIG_FILE" >&2
    bad=1
  fi

  return "$bad"
}

if [ "${1:-}" = "--self-test" ]; then
  run_self_test
  exit 0
fi

if [ -n "${1:-}" ]; then
  echo "usage: scripts/policy-boundary-gates.sh [--self-test]" >&2
  exit 2
fi

run_policy_checks
