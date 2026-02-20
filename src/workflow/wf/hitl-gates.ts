import { toHitlPromptKey, toHitlResultKey } from "../hitl/keys";
import { toHumanTopic } from "../../lib/hitl-topic";
import type { IntentWorkflowSteps } from "./run-intent.wf";

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

  if (!emitted) {
    // Persist gate marker as a step (enforces uniqueness)
    await steps.openHumanGate(runId, gateKey, topic);

    // Publish prompt as an event (UI state channel)
    await steps.setEvent(promptKey, {
      gateKey,
      formSchema,
      runId,
      workflowId,
      ttlS,
      createdAt: Date.now() // display only, stable after commit
    });
  }

  // 2. Wait for reply (command channel)
  const reply = await steps.recv<T>(topic, ttlS);

  if (reply === null) {
    const timeoutResult: GateResult<T> = { ok: false, timeout: true };
    await steps.setEvent(resultKey, timeoutResult);
    return timeoutResult;
  }

  // 4. Record success
  const successResult: GateResult<T> = { ok: true, v: reply };
  await steps.setEvent(resultKey, successResult);
  return successResult;
}
