# Sisu-Kodo 0.9: Recipe Flywheel Platform

Expert handoff for Cycle 009. Focus: deterministic recipe-driven flywheel, HITL/Ops oracles, and SQL-proven x-once.

## 0. Current Kernel (Laws)

- **Product Identity**: `intentHash=sha256(canon(intent))`; `intentId=ih_<hash>`; `workflowID=intentId`.
- **SQL Oracle**: `app.*` + `dbos.workflow_status/events` are the only truth. Logs are narrative.
- **Fail-Closed**: Malformed JSON/schema/policy => 400 + zero writes. No boundary `as` casts.
- **Dedupe Law**: interaction x-once tuple `(wid,gate,topic,dedupe_key)` with semantic drift guard (409).
- **Patch Law**: `ApplyPatchST` is reversible; persistence of `(pre,post,diff)_hash` required before apply.
- **Proof Floor**: `mise run quick/check/full` green + `crashdemo` (s1:1,s2:1) + `DAG check` mandatory.

## 1. Bootstrap & Setup

```bash
# Clean state (host-serialized db:sys:reset is critical)
MISE_TASK_OUTPUT=prefix mise install
mise run db:up && mise run db:sys:reset && mise run db:reset && mise run build

# Start Monolith (Monolith = App + Worker in one process)
OC_MODE=replay SBX_MODE=mock PORT=3001 ADMIN_PORT=3002 mise run start

# Split-Topology (Shim + Worker + shared DBOS__APPVERSION)
OC_MODE=replay DBOS__APPVERSION=v1 PORT=3001 ADMIN_PORT=3002 mise run start:worker
OC_MODE=replay DBOS__APPVERSION=v1 PORT=3001 ADMIN_PORT=3002 mise run start:api-shim
```

## 2. Recipe Lifecycle (Bet A)

- **Import**: `POST /api/recipes/import` (strict Ajv). Versions arrive as `draft`.
- **Export**: `POST /api/recipes/export` (canonical JSON egress).
- **Promote**: `setCandidate -> promoteStable`. Manual promote for demo:

```bash
pnpm exec tsx -e "import { createPool, closePool } from './src/db/pool'; import { setCandidate, promoteStable } from './src/db/recipeRepo'; const p=createPool(); await setCandidate(p,'seed.r01','1.0.0'); await promoteStable(p,'seed.r01','1.0.0'); await p.end(); await closePool();"
```

## 3. Product Path Ingress (Bet B/C)

- **Canonical Route**: `POST /api/run` (replaces legacy `/api/intents`).
- **Idempotency**: Same `recipeRef` + `formData` => same `workflowID` (converges on `intentHash`).

```bash
# Start/Replay (Idempotent success)
curl -sS -X POST http://127.0.0.1:3001/api/run -H 'content-type: application/json'
  -d '{"recipeRef":{"id":"seed.r01","v":"1.0.0"},"formData":{"topic":"alpha"}}' | jq .
```

- **Observation**: `GET /api/runs/:wid` (header) and `GET /api/runs/:wid/steps` (projections).

## 4. HITL & Ops Controls (Bet H)

- **HITL Ingress**: Accept only `waiting_input` lanes. Topic must match gate topic.
- **Reply**: `POST /api/runs/:wid/gates/:gate/reply`. Requires `origin` (manual|bridge).
- **Ops Exact-Six**: `/api/ops/wf/{list,get,steps,cancel,resume,fork}` only.

```bash
# Approve Gate
curl -sS -X POST http://127.0.0.1:3001/api/runs/${WID}/gates/${GATE}/reply
  -H 'content-type: application/json'
  -d '{"payload":{"approved":true},"dedupeKey":"d1","origin":"manual"}'
```

## 5. Reversible Patching (Bet G)

- **Wiring**: `ApplyPatchST` invokes `applyReversiblePatch` + `insertArtifact` per patch.
- **Guard**: Filesystem targets fail-closed to `.tmp/**`.
- **Rollback**: Catch block in `run-intent.wf.ts` triggers `rollbackAppliedPatches` (reverse order).
- **Idempotence**: Apply accepts already-postimage; rollback accepts already-preimage.

## 6. Triage & Repro Oracle

- **Snapshot**: `scripts/repro-pack.ts` captures full SQL tuple (app + dbos events).

```bash
pnpm exec tsx scripts/repro-pack.ts --run ${WID} --out /tmp/repro.json
```

- **Oracle Checklist**: Check `app.runs.status` -> `app.run_steps` -> `dbos.workflow_status/events`.

## 7. Verification Floor

- **Unit**: `test/unit/*.test.ts` (fakes only).
- **Integration**: `scripts/test-integration-mock.sh` (local PG).
- **Policy**: `scripts/policy-*.sh` (self-tested probes: `bad=>fail`, `good=>pass`).
- **Durability**: `mise run -f wf:crashdemo` (verifies restart-resume marks).
- **Signoff**: `mise run full` + `mise tasks deps check`.

## 8. Current Backlog / Gaps

- `ApplyPatchST` wiring is complete and proven with `TST.04`; next is auto-patchgen integration.
- `DBOS.now` used for HITL timestamps; async mock in `hitl-kill4` verifies determinism.
- Hermetic port reservation (`reserveTestPorts`) prevents host collisions in shared CI.
- Legacy routes gated by `ENABLE_LEGACY_RUN_ROUTES` (default true); move to 410 soon.
