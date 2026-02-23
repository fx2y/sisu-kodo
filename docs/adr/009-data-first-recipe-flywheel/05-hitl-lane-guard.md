# HITL Lane & Topic Guards

ADR 009 enforces the **Lane-Guarded Ingress** for all Human-In-The-Loop (HITL) interactions. A reply or event is only valid if it arrives for a workflow that is explicitly waiting for it.

## Lane Guard

The `postReplyService` and `postExternalEventService` must verify the run's status before committing any ledger writes or sending any workflow events.

### Invariants:

1.  **Status Check**: `run.status == 'waiting_input'`. Reject all others with `409 Conflict`.
2.  **Gate Resolution**: `(run_id, gate_key)` must resolve to a valid, open gate.
3.  **Topic Match**: For external events, the incoming `topic` must match the gate's `topic`.

## Semantic Dedupe Drift Guard

To prevent duplicate-reply bugs, the system uses a persistent interaction ledger (`app.human_interactions`).

### Formula:

`dedupe_key` is typically provided by the caller. The ledger key is `(workflow_id, gate_key, topic, dedupe_key)`.

### Drift Conflict:

If a duplicate `dedupe_key` is used with a different `topic` or `payload`, the system must return a `409 Conflict` rather than silently ignoring the drift.

### Snippet: Guarded Reply

```typescript
async function postReplyService(wid: string, gateKey: string, reply: GateReply) {
  const run = await resolveRunByWID(wid);
  if (run.status !== "waiting_input") {
    throw new Error("RUN_NOT_WAITING");
  }

  const gate = await resolveGate(run.id, gateKey);
  if (!gate) {
    throw new Error("GATE_NOT_FOUND");
  }

  // Persist x-once ledger + send event in one txn
  await ledgerAndSend(wid, gateKey, reply);
}
```
