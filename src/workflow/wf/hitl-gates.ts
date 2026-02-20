import { toHitlPromptKey, toHitlResultKey } from "../hitl/keys";
import { toHumanTopic } from "../../lib/hitl-topic";
import type { IntentWorkflowSteps } from "./run-intent.wf";
import type { GateResult as EventGateResult } from "../../contracts/hitl/gate-result.schema";
import type { GatePrompt } from "../../contracts/hitl/gate-prompt.schema";

export type GateResult<T> = { ok: true; v: T } | { ok: false; timeout: true };

/**
 * Reusable HITL gate primitive.
 * sequence: wasPromptEmitted? -> openHumanGate -> setEvent(ui) -> recv(human) -> setEvent(result)
 */
export async function awaitHuman<T>(
  steps: IntentWorkflowSteps,
  workflowId: string,
  runId: string,
  gateKey: string,
  formSchema: object,
  ttlS: number
): Promise<GateResult<T>> {
  const promptKey = toHitlPromptKey(gateKey);
  const resultKey = toHitlResultKey(gateKey);
  const topic = toHumanTopic(gateKey);

  // 1. Check if prompt already exists (phantom protection on restart)
  const emitted = await steps.wasPromptEmitted(workflowId, gateKey);

  const now = steps.getTimestamp();
  if (!emitted) {
    // Persist gate marker as a step (enforces uniqueness)
    await steps.openHumanGate(runId, gateKey, topic);

    // Publish prompt as an event (UI state channel)
    const prompt: GatePrompt = {
      schemaVersion: 1,
      formSchema: formSchema as Record<string, unknown>,
      ttlS,
      createdAt: now,
      deadlineAt: now + ttlS * 1000,
      uiHints: null,
      defaults: null
    };
    await steps.setEvent(promptKey, prompt);
  }

  // 2. Wait for reply (command channel)
  const reply = await steps.recv<T>(topic, ttlS);

  if (reply === null) {
    const timeoutResult: GateResult<T> = { ok: false, timeout: true };
    const eventResult: EventGateResult = {
      schemaVersion: 1,
      state: "TIMED_OUT",
      at: steps.getTimestamp()
    };
    await steps.setEvent(resultKey, eventResult);
    return timeoutResult;
  }

  // 4. Record success
  const successResult: GateResult<T> = { ok: true, v: reply };
  const eventResult: EventGateResult = {
    schemaVersion: 1,
    state: "RECEIVED",
    payload: reply as Record<string, unknown>,
    at: steps.getTimestamp()
  };
  await steps.setEvent(resultKey, eventResult);
  return successResult;
}
