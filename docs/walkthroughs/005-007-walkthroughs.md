# Walkthrough: Live Ops & Mastery (Specs 05-07)

Expert SSOT for operating the merged 05-07 implementation via Spec 12-02. Fail-closed law strictly enforced.

## 0. Foundational Posture
- **Identity**: `intentId = ih_<sha256(canon(intent))>`. Duplicate start = idem success. Drift => `409`.
- **Lattice**: `400`=Malformed/Policy, `404`=Missing, `409`=State/Conflict, `500`=Unexpected only.
- **Queue**: Parent `intentQ` only. Fanout `sbxQ` only. Partition mandatory if enabled.
- **Audit**: Every control action (Cancel/Resume/Fork) appends `OPS` artifact.

## 1. Environment: Strict Live Posture
Disable legacy routes. Enforce partition law. Set OTLP requirements.

```bash
# Sourcing live config
source .env 2>/dev/null || echo "WARN: .env missing"

export BASE=http://127.0.0.1:3001
export APPV=v1
export WORKFLOW_RUNTIME_MODE=api-shim
export DBOS__APPVERSION=$APPV
export OC_MODE=live
export SBX_MODE=live
export SBX_PROVIDER=e2b
export OC_STRICT_MODE=1
export SBX_QUEUE_PARTITION=true
export SBX_ALT_PROVIDER_ENABLED=false
export ENABLE_LEGACY_RUN_ROUTES=false
export CLAIM_SCOPE=live-smoke
```

## 2. Infrastructure: Boot & Lanes
Prepare DB and split-topology lanes.

```bash
# Step A: Toolchain + DB Reset (Cold Start)
MISE_TASK_OUTPUT=prefix mise install
mise run db:up
mise run db:sys:reset && mise run db:reset
mise run build

# Step B: Runtime Lane A (Monolith for Local)
PORT=3001 ADMIN_PORT=3002 mise run start

# Step C: Runtime Lane B (Split Parity for Cluster) - Run in separate terminals
# Worker (Execute only)
PORT=3011 ADMIN_PORT=3012 DBOS__APPVERSION=$APPV mise run start:worker
# Shim (Ingress/Read only)
PORT=3011 ADMIN_PORT=3013 DBOS__APPVERSION=$APPV mise run start:api-shim
```

**Smoke Test:**
```bash
curl -sf $BASE/healthz | jq .
curl -sf "$BASE/api/ops/queue-depth?limit=5" | jq .
scripts/db/psql-app.sh -c 'select 1'
```

## 3. End-User (EU) Manual: Business Value Delivery
Manual for live end-users and FDEs to operate the shipped implementation in production-grade environments.

### 3.1 Tenant Onboarding & Recipe Discovery
Discovery of the Single Source of Truth for system capabilities. No guessing.
```bash
# Locate the "Stable" production recipe for the Value Delivery workload
R=$(scripts/db/psql-app.sh -Atc "
  SELECT rv.id||'@'||rv.v 
  FROM app.recipe_versions rv 
  JOIN app.recipes r ON r.id=rv.id AND r.active_v=rv.v 
  WHERE r.id LIKE '%value-delivery%' OR r.id LIKE '%risk%'
  ORDER BY rv.created_at DESC LIMIT 1
")

# Fallback to any active if specific naming not found
if [ -z "$R" ]; then
  R=$(scripts/db/psql-app.sh -Atc "select rv.id||'@'||rv.v from app.recipe_versions rv join app.recipes r on r.id=rv.id and r.active_v=rv.v order by rv.created_at desc limit 1")
fi

RID=${R%@*}; RV=${R#*@}
echo "PROD_RECIPE=$RID version $RV"
```

### 3.2 Scenario: Mission-Critical Batch Ingress
Triggering a high-concurrency partition-isolated workload.
```bash
# Define Workload Profile
TENANT_ID="acme-corp"
GOAL="Analyze portfolio risk for Q1"

# Build payload with strict budget and partition isolation
PAYLOAD=$(jq -nc \
  --arg rid "$RID" --arg rv "$RV" \
  --arg tenant "$TENANT_ID" --arg goal "$GOAL" \
  '{
    recipeRef: {id: $rid, v: $rv},
    formData: {goal: $goal, tenant: $tenant, priority: "high"},
    opts: {
      queueName: "intentQ",
      queuePartitionKey: $tenant,
      lane: "interactive",
      workload: {
        concurrency: 5,
        steps: 10,
        sandboxMinutes: 30,
        maxRetriesPerStep: 3
      }
    }
  }')

# Execute Ingress
W=$(curl -sS -X POST $BASE/api/run \
  -H 'Content-Type: application/json' \
  -d "$PAYLOAD" | jq -r .workflowID)

echo "Workflow Initialized: $W"
```

### 3.3 Scenario: HITL Approval & Gate Polling
Operating the "Human-In-The-Loop" decision points for high-stakes flows.
```bash
# Poll until system requests input (WAITING_INPUT)
while true; do
  STATUS=$(curl -sS $BASE/api/runs/$W | jq -r .status)
  echo "Current State: $STATUS"
  [[ "$STATUS" == "WAITING_INPUT" ]] && break
  [[ "$STATUS" =~ SUCCESS|ERROR|CANCELLED ]] && exit 1
  sleep 2
done

# Discover Decision Gates
GATES=$(curl -sS $BASE/api/runs/$W/gates)
GATE_KEY=$(echo "$GATES" | jq -r '.[0].gateKey')
PROMPT=$(echo "$GATES" | jq -r '.[0].prompt')

echo "Decision Required: $PROMPT (Gate: $GATE_KEY)"

# Submit Deterministic Decision
curl -sS -X POST "$BASE/api/runs/$W/gates/$GATE_KEY/reply" \
  -H 'Content-Type: application/json' \
  -d "{
    \"payload\": {\"decision\": \"approved\", \"risk_level\": \"low\"},
    \"dedupeKey\": \"approval-$(date +%Y%m%d)-$W\",
    \"origin\": \"portfolio-manager\"
  }"
```

### 3.4 Value Retrieval & Evidence Export
Extracting the final results and the proof for compliance/auditing.
```bash
# 1. Fetch Terminal Artifacts
ARTIFACTS=$(curl -sS $BASE/api/runs/$W/steps | jq -r 'map(.artifactRefs[])')

# 2. Extract Data (e.g., Risk Report)
REPORT_URI=$(echo "$ARTIFACTS" | jq -r '.[] | select(.uri | contains("report")) | .uri')
curl -sS "$BASE/api/artifacts/$(printf '%s' "$REPORT_URI" | jq -sRr @uri)" > .tmp/risk_report_$W.pdf

# 3. Export Immutable Repro Pack for Audit
curl -sS "$BASE/api/runs/$W/repro" > .tmp/audit_proof_$W.json
echo "Business Value Delivered. Evidence saved to .tmp/"
```

## 4. Operator (FDE) Mastery: Incident Control
Masterclass for Field Deployment Engineers (FDE) to triage and repair live runs.

### 4.1 Scenario: Hung Worker Recovery
Handling the "Queued Forever" symptom (Worker crash/misconfig).
```bash
# 1. Diagnose: Check Queue Depth & Partition status
curl -sf "$BASE/api/ops/queue-depth" | jq .

# 2. Audit: Check DBOS runtime version mismatch
scripts/db/psql-sys.sh -c "SELECT workflow_uuid, status, application_version FROM dbos.workflow_status WHERE workflow_uuid = '$W'"

# 3. Action: If worker was dead, resume to re-enqueue
curl -sS -X POST $BASE/api/ops/wf/$W/resume \
  -d '{"actor":"fde-oncall","reason":"recovery-after-worker-reboot"}'
```

### 4.2 Scenario: Branching & State Repair (Forking)
Repairing a run by forking it to a new branch from a known-good step.
```bash
# Identify last successful step
LAST_ST=$(curl -sS $BASE/api/ops/wf/$W/steps | jq -r 'map(select(.status=="COMPLETED")) | last | .stepID')
STEP_IDX=$(curl -sS $BASE/api/ops/wf/$W/steps | jq -r 'map(select(.status=="COMPLETED")) | length')

echo "Good state found at Step $STEP_IDX ($LAST_ST). Forking..."

# Fork creates a NEW workflowID with identical history up to STEP_IDX
NEW_WID=$(curl -sS -X POST $BASE/api/ops/wf/$W/fork \
  -d "{\"stepN\": $STEP_IDX, \"actor\": \"fde-repair\", \"reason\": \"patching logic drift\"}" | jq -r .forkedWorkflowID)

echo "Repaired Run: $NEW_WID"
```

### 4.3 Audit & CLI Kit
Durable evidence of operator intervention.
```bash
# SQL Intent Audit
scripts/db/psql-app.sh -c "SELECT run_id, inline->>'op' op, inline->>'actor' actor FROM app.artifacts WHERE step_id='OPS' ORDER BY created_at DESC"

# Batch CLI Ops
mise run ops:list-failed
printf '%s\n' "$W" | mise run ops:cancel-batch
```

## 5. QA Manual: Proof Floors
Verification procedures for fail-closed properties.

### 5.1 Input Schema & Zero-Write Policy
Verify invalid input causes zero DB mutations.
```bash
# Check counts before
B0=$(scripts/db/psql-app.sh -Atc "select count(*) from app.runs")

# Malformed JSON
curl -i -X POST $BASE/api/run -d '{bad'

# Policy Violation (Wrong Queue)
curl -i -X POST $BASE/api/run -d '{"opts":{"queueName":"sbxQ"}}'

# Check counts after (Must be equal)
A0=$(scripts/db/psql-app.sh -Atc "select count(*) from app.runs")
test "$B0" = "$A0" && echo "Zero-Write OK"
```

### 5.2 Idempotency & Drift (409)
```bash
# Canonical Replay => Success (Same WID)
curl -sS -X POST $BASE/api/run -d "$B" | jq .

# Payload Drift => 409
B_DRIFT=$(echo "$B" | jq '.opts.queuePartitionKey="tenant-other"')
curl -i -X POST $BASE/api/run -d "$B_DRIFT" # Expect 409
```

### 5.3 Exactly-Once Side Effects (SQL)
Verify no duplicate receipts or artifacts.
```bash
# Ensure 0 rows
scripts/db/psql-app.sh -c "SELECT run_id,count(*) FROM app.mock_receipts GROUP BY run_id HAVING count(*)>1"
scripts/db/psql-app.sh -c "SELECT run_id,step_id,attempt,count(*) FROM app.artifacts GROUP BY run_id,step_id,attempt,idx HAVING count(*)>1"
```

## 6. Time & Telemetry
Verify durability of async operations and observability stability.

### 6.1 Sleep & Scheduler Catch-up
```bash
# Durable Sleep Action
SWF=sleep_$(date +%s)
curl -sS -X POST "$BASE/api/ops/sleep?wf=$SWF&sleep=2000"

# Scheduler Tick Check
scripts/db/psql-app.sh -c "SELECT count(*) FROM app.artifacts WHERE step_id='ScheduledTick'"
```

### 6.2 OTLP Fail-Fast
Ensure telemetry presence before operation.
```bash
OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=http://127.0.0.1:4318 OTLP_REQUIRED=1 pnpm exec tsx scripts/otlp-smoke.ts
```

## 7. Operational Triage (FDE Ref)
Ordered diagnostic path:
1. `/healthz` (Service up?)
2. `/api/ops/queue-depth` (System backlogged?)
3. `app.runs` SQL (State transition stuck?)
4. `dbos.workflow_status` SQL (DBOS worker failure?)
5. `repro-pack` (Deep state dump)
6. Logs (Last resort only)

## 8. Release Gate: Mandatory Green
Binary release truth. Any red => `NO_GO`.
```bash
mise run quick    # Basic lint/test
mise run check    # Integration suite
mise run full     # Chaos/Soak/Matrix
mise run wf:crashdemo # Durability floor
```

## 9. Cleanup & Closeout
Archive evidence and stop lanes.
```bash
mkdir -p .tmp/spec12-02
cp -f /tmp/v12.* .tmp/spec12-02/
mise run stop
```
