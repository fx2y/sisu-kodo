import type { GatePrompt } from "../contracts/hitl/gate-prompt.schema";
import type { GateResult } from "../contracts/hitl/gate-result.schema";
import type { GateView, GateState } from "../contracts/ui/gate-view.schema";
import type { GateDecision } from "../contracts/hitl/gate-decision.schema";

export function projectGateView(
  workflowId: string,
  gate: { gateKey: string; topic: string; createdAt: number },
  prompt: GatePrompt,
  result?: GateResult | null,
  decision?: GateDecision | null,
  interactionMeta?: { origin: GateView["origin"]; payloadHash: string } | null
): GateView {
  let state: GateState = "PENDING";
  if (result?.state === "TIMED_OUT") {
    state = "TIMED_OUT";
  } else if (result?.state === "RECEIVED") {
    state = decision ? "RESOLVED" : "RECEIVED";
  }

  return {
    workflowID: workflowId,
    gateKey: gate.gateKey,
    topic: gate.topic,
    state,
    prompt,
    result,
    origin: interactionMeta?.origin ?? null,
    payloadHash: interactionMeta?.payloadHash ?? null,
    createdAt: gate.createdAt,
    deadlineAt: prompt.deadlineAt
  };
}
