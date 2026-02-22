# Durable HITL Gates (Cycle 8 Handoff)

**Status:** Cycle 8 Released (2026-02-22).  
**Context:** Durable Human-In-The-Loop (HITL) + Gate ABI + Interaction Ledger + Stream Adjuncts.  
**Law:** `Contract > Determinism/Fail-Closed > SQL-Oracle Exactly-Once > Ergonomics`.

## 1. The Four Planes

Hard isolation between these planes is the only way to avoid "phantom prompts" and "blackhole replies":

- **Control-Plane:** Workflow + Gate ABI (`ui:*` events). Deterministic state machine.
- **Data-Plane:** `CompileST|ApplyPatchST|DecideST|ExecuteST` + `app.artifacts`.
- **Signal-Plane:** `DBOS.setEvent/getEvent` + `DBOS.send` + Streams. Async transport.
- **Proof-Plane:** `app.human_interactions` (Ledger) + SQL Oracle. Durable truth.

## 2. Gate ABI & Immutables

Bypassing this ABI for human interaction is a law break.

- **Gate Keys:** `ui:<g>` (Prompt), `ui:<g>:result` (Outcome), `decision:<g>` (Branch), `ui:<g>:audit` (Trace).
- **Topics:** `human:<gateKey>` (Direct reply), `sys:<kind>` (System events).
- **Wait State:** `run.status=waiting_input` + `nextAction=APPROVE_PLAN`. Mandatory pre-wait.
- **Dedupe Law:** `dedupeKey` is mandatory for ALL replies. Persistent across retries/refresh.
- **Origin Law:** `origin` is mandatory. Allowed: `manual|engine-dbos|api-shim|webhook|webhook-ci|external|unknown`.

## 3. The `awaitHuman` Primitive

Atomic, restart-safe, and fail-closed. Implemented in `src/workflow/wf/hitl-gates.ts`.

- **Restart Safety:** Uses `wasPromptEmitted` check to prevent duplicate `ui:<g>` on worker crash.
- **FSM Projection:** `PENDING` (Prompt exists) -> `RECEIVED` (Reply valid) OR `TIMED_OUT` (TTL hit).
- **Escalation:** Separate deterministic WF enqueued with `workflowID=esc:<wid>:<gate>`.

### Example: The `awaitHuman` Call

```typescript
const result = await awaitHuman(context, {
  gateKey: "plan-approval",
  formSchema: PlanApprovalSchema,
  topic: "human:plan-approval",
  timeoutS: 300,
  escalation: { queue: "controlQ", priority: 1 }
});

if (result.choice === "yes") {
  // Branch deterministic even after restart
}
```

## 4. Interaction Ledger (The Oracle)

Truth is `app.human_interactions`, NOT the `human-event` signal.

- **Constraint:** `UNIQUE (workflow_id, gate_key, topic, dedupe_key)`.
- **Integrity:** `payload_hash` (SHA-256) is mandatory. Mismatch on same dedupe key => `409 Conflict`.
- **Fail-Closed:** Ledger entry MUST be finalized _before_ the signal is sent. No signal without a row.

## 5. Dual Router Parity (The Split-Topology Law)

New HITL routes MUST exist in both surfaces to support integration (shim) and production (Next).

- **App Router:** `app/api/runs/[wid]/gates/[gateKey]/reply/route.ts`.
- **Manual Router:** `src/server/http.ts` (Wired via `postReplyService`).
- **Receiver:** Unified `/api/events/hitl` wired to `postExternalEventService`.

## 6. Walkthrough: PO/FDE Field-Course

```bash
# 1. Create Intent
INTENT=$(curl -sf -X POST http://127.0.0.1:3001/api/intents -d '{"goal":"demo"}' | jq -r .intentId)

# 2. Start Run (Partition enabled)
WID=$(curl -sf -X POST http://127.0.0.1:3001/api/runs -d "{"intentId":"$INTENT","queuePartitionKey":"p1"}" | jq -r .workflowID)

# 3. Observe Wait State
watch -n 1 "curl -sf http://127.0.0.1:3001/api/runs/$WID | jq '{status,nextAction}'"
# Expected: status="waiting_input", nextAction="APPROVE_PLAN"

# 4. Open Gate (Long-poll support)
curl -sf "http://127.0.0.1:3001/api/runs/$WID/gates/plan-approval?timeoutS=5"

# 5. Reply (Dedupe required)
curl -X POST http://127.0.0.1:3001/api/runs/$WID/gates/plan-approval/reply
  -d '{"payload":{"choice":"yes"},"dedupeKey":"demo-1","origin":"manual"}'
```

## 7. Fail-Closed Verification (QA Specs)

Proving a fix requires a "Fail-Before/Pass-After" proof.

| Scenario        | Input                             | Expected          | Oracle                              |
| :-------------- | :-------------------------------- | :---------------- | :---------------------------------- |
| Malformed JSON  | `{bad`                            | `400 Bad Request` | Zero writes to `human_interactions` |
| Bad GateKey     | `G!#@`                            | `400 Bad Request` | Zero writes to `human_interactions` |
| Missing Run     | `nonexistent`                     | `404 Not Found`   | Zero writes to `human_interactions` |
| Dedupe Conflict | `key1` then `key1` (diff payload) | `409 Conflict`    | Exactly 1 interaction row           |
| Topic Mismatch  | `gate:A` on `topic:B`             | `409 Conflict`    | Zero writes to `human_interactions` |

## 8. Pitfalls & Footguns (Banned Patterns)

- **Banned:** `DBOS.send` in steps. Use `sendMessage` from workflow context only.
- **Banned:** `Math.random` for dedupe keys. Keys must be stable (prompt-derived).
- **Banned:** Parent runs on `sbxQ`. Parent MUST stay on `intentQ` to avoid deadlocks.
- **Banned:** Shadowing `PORT` in `mise.toml`. Must allow shell overrides for split-topology.
- **Banned:** Silent fallbacks in ingress. Schema violation MUST return `400`, never `500`.

## 9. Proof Floor (The Final Gate)

A change is incomplete without these green lanes:

1. **Quick:** `mise run quick` (Policy: `policy-hitl-event-abi` + Unit).
2. **Check:** `mise run check` (Integration: `hitl-gate-api`, `hitl-error-handling`).
3. **Full:** `mise run full` (E2E: `plan-approval-api`, `run-view-golden`).
4. **Load:** `mise run hitl:burst:soak` (1k runs, bounded concurrency=12).

**Triage Order:** `/healthz` -> `/api/runs/:wid` -> `app.human_interactions` -> `dbos.workflow_status` -> logs.
