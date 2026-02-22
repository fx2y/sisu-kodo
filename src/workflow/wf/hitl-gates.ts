import { toHitlPromptKey, toHitlResultKey, toHitlDecisionKey, toHitlAuditKey } from "../hitl/keys";
import { toHumanTopic } from "../../lib/hitl-topic";
import type { IntentWorkflowSteps } from "./run-intent.wf";
import {
  assertGateResult,
  type GateResult as EventGateResult
} from "../../contracts/hitl/gate-result.schema";
import type { GatePrompt } from "../../contracts/hitl/gate-prompt.schema";
import { assertGateDecision, type GateDecision } from "../../contracts/hitl/gate-decision.schema";
import { assertGateAudit, type GateAudit } from "../../contracts/hitl/gate-audit.schema";

export type GateResult<T> = { ok: true; v: T } | { ok: false; timeout: true };

export type HumanDecision = {
  choice: "yes" | "no";
  rationale?: string;
};

export type HitlChaosPhase = "a" | "b" | "c" | "d";

const DEFAULT_SCOPE = "*";
const chaosPhaseByScope = new Map<string, HitlChaosPhase>();
const consumedByWorkflowAndPhase = new Set<string>();

export class HitlChaosCrashError extends Error {
  constructor(
    public readonly phase: HitlChaosPhase,
    public readonly workflowId: string
  ) {
    super(`[CHAOS] simulated crash at phase ${phase}`);
    this.name = "HitlChaosCrashError";
  }
}

function toChaosScope(workflowId?: string): string {
  return workflowId ?? DEFAULT_SCOPE;
}

export function setHitlChaosPhase(phase: HitlChaosPhase | undefined, workflowId?: string): void {
  const scope = toChaosScope(workflowId);
  if (!phase) {
    chaosPhaseByScope.delete(scope);
    return;
  }
  chaosPhaseByScope.set(scope, phase);
}

export function clearHitlChaosPhases(): void {
  chaosPhaseByScope.clear();
  consumedByWorkflowAndPhase.clear();
}

function resolveChaosPhase(workflowId: string): HitlChaosPhase | undefined {
  return chaosPhaseByScope.get(workflowId) ?? chaosPhaseByScope.get(DEFAULT_SCOPE);
}

async function chaosCrash(phase: HitlChaosPhase, workflowId: string): Promise<void> {
  const configured = resolveChaosPhase(workflowId);
  if (configured !== phase) return;

  const token = `${workflowId}:${phase}`;
  if (consumedByWorkflowAndPhase.has(token)) return;
  consumedByWorkflowAndPhase.add(token);

  throw new HitlChaosCrashError(phase, workflowId);
}

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

  await chaosCrash("a", workflowId); // (a) before setEvent (including openHumanGate)

  // 1. Check if prompt already exists (phantom protection on restart)
  const emitted = await steps.wasPromptEmitted(workflowId, gateKey);

  const now = await steps.getTimestamp();
  if (!emitted) {
    // Persist gate marker as a step (enforces uniqueness)
    await steps.openHumanGate(runId, gateKey, topic);

    await chaosCrash("b", workflowId); // (b) after openHumanGate before setEvent(promptKey)

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

  await chaosCrash("c", workflowId); // (c) while blocked on recv (right before it)

  // 2. Wait for reply (command channel)
  const reply = await steps.recv<T>(topic, ttlS);

  if (reply === null) {
    const timeoutResult: GateResult<T> = { ok: false, timeout: true };
    const eventResult: EventGateResult = {
      schemaVersion: 1,
      state: "TIMED_OUT",
      at: await steps.getTimestamp()
    };
    assertGateResult(eventResult);
    await steps.setEvent(resultKey, eventResult);

    // GAP S1.03: Emit audit event
    const auditEvent: GateAudit = {
      schemaVersion: 1,
      event: "TIMED_OUT",
      reason: "TTL expired",
      at: await steps.getTimestamp()
    };
    assertGateAudit(auditEvent);
    await steps.setEvent(toHitlAuditKey(gateKey), auditEvent);

    return timeoutResult;
  }

  await chaosCrash("d", workflowId); // (d) after recv before persist result

  // 4. Record success
  const successResult: GateResult<T> = { ok: true, v: reply };
  const eventResult: EventGateResult = {
    schemaVersion: 1,
    state: "RECEIVED",
    payload: reply as Record<string, unknown>,
    at: await steps.getTimestamp()
  };
  assertGateResult(eventResult);
  await steps.setEvent(resultKey, eventResult);

  // GAP S1.03: Emit audit event
  const replyRecord = reply as unknown as Record<string, unknown>;
  const auditEvent: GateAudit = {
    schemaVersion: 1,
    event: "RECEIVED",
    actor: typeof replyRecord.actor === "string" ? replyRecord.actor : null,
    reason: typeof replyRecord.rationale === "string" ? replyRecord.rationale : null,
    at: await steps.getTimestamp()
  };
  assertGateAudit(auditEvent);
  await steps.setEvent(toHitlAuditKey(gateKey), auditEvent);

  return successResult;
}

/**
 * Approval gate = decision-as-data.
 * Returns HumanDecision and persists it as an event.
 */
export async function approve(
  steps: IntentWorkflowSteps,
  workflowId: string,
  runId: string,
  gateKey: string,
  ttlS = 3600
): Promise<HumanDecision> {
  const decisionKey = toHitlDecisionKey(gateKey);

  const r = await awaitHuman<HumanDecision>(
    steps,
    workflowId,
    runId,
    gateKey,
    {
      v: 1,
      title: "Approve?",
      fields: [
        { k: "choice", t: "enum", vs: ["yes", "no"] },
        { k: "rationale", t: "str", opt: true }
      ]
    },
    ttlS
  );

  if (!r.ok) {
    // Enqueue escalation workflow
    await steps.enqueueEscalation(workflowId, gateKey);

    const timeoutDecision: GateDecision = {
      schemaVersion: 1,
      decision: "no",
      payload: { rationale: "timeout" },
      at: await steps.getTimestamp()
    };
    assertGateDecision(timeoutDecision);
    await steps.setEvent(decisionKey, timeoutDecision);
    return { choice: "no", rationale: "timeout" };
  }

  // Persist decision-as-data before returning to workflow.
  const replyRecord = r.v as unknown as Record<string, unknown>;
  const choice =
    r.v.choice === "yes" || r.v.choice === "no"
      ? r.v.choice
      : replyRecord.approved === true
        ? "yes"
        : replyRecord.approved === false
          ? "no"
          : "no";
  const rationale =
    typeof r.v.rationale === "string"
      ? r.v.rationale
      : typeof replyRecord.rationale === "string"
        ? replyRecord.rationale
        : null;

  const decision: GateDecision = {
    schemaVersion: 1,
    decision: choice,
    payload: rationale === null ? null : { rationale },
    at: await steps.getTimestamp()
  };
  assertGateDecision(decision);
  await steps.setEvent(decisionKey, decision);
  return rationale === null ? { choice } : { choice, rationale };
}
