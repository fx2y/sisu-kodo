import type { GatePrompt } from "../contracts/hitl/gate-prompt.schema";
import type { GateResult } from "../contracts/hitl/gate-result.schema";
import type { GateView, GateState } from "../contracts/ui/gate-view.schema";
import { nowMs } from "../lib/time";

export function projectGateView(
  workflowId: string,
  gateKey: string,
  prompt: GatePrompt,
  result?: GateResult | null
): GateView {
  let state: GateState = "PENDING";
  if (result) {
    state = result.state;
  } else if (nowMs() > prompt.deadlineAt) {
    state = "TIMED_OUT";
  }

  return {
    workflowID: workflowId,
    gateKey,
    state,
    prompt,
    result,
    deadlineAt: prompt.deadlineAt
  };
}
