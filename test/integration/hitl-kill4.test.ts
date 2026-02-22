import { afterEach, describe, expect, test } from "vitest";

import type { IntentWorkflowSteps } from "../../src/workflow/wf/run-intent.wf";
import {
  awaitHuman,
  clearHitlChaosPhases,
  HitlChaosCrashError,
  setHitlChaosPhase,
  type HitlChaosPhase
} from "../../src/workflow/wf/hitl-gates";
import { toHitlPromptKey, toHitlResultKey } from "../../src/workflow/hitl/keys";

type AwaitHumanSteps = Pick<
  IntentWorkflowSteps,
  "wasPromptEmitted" | "openHumanGate" | "recv" | "setEvent" | "getTimestamp"
>;

class InMemoryAwaitHumanSteps implements AwaitHumanSteps {
  private now = 1_000;
  private queuedReply: Record<string, unknown> | null;
  private readonly events = new Map<string, unknown>();
  private readonly opened = new Set<string>();
  private promptCount = 0;

  constructor(initialReply: Record<string, unknown>) {
    this.queuedReply = initialReply;
  }

  enqueueReply(reply: Record<string, unknown>): void {
    this.queuedReply = reply;
  }

  getPromptCount(): number {
    return this.promptCount;
  }

  getOpenCount(): number {
    return this.opened.size;
  }

  getEvent(key: string): unknown {
    return this.events.get(key);
  }

  async wasPromptEmitted(_workflowId: string, gateKey: string): Promise<boolean> {
    return this.events.has(toHitlPromptKey(gateKey));
  }

  async openHumanGate(_runId: string, gateKey: string, _topic: string): Promise<void> {
    this.opened.add(gateKey);
  }

  async recv<T>(_topic: string, _timeoutS: number): Promise<T | null> {
    if (this.queuedReply === null) {
      return null;
    }
    const reply = this.queuedReply;
    this.queuedReply = null;
    return reply as T;
  }

  async setEvent<T>(key: string, value: T): Promise<void> {
    if (key.endsWith(":result")) {
      // Result writes should be latest-wins for projection behavior.
      this.events.set(key, value);
      return;
    }
    if (!this.events.has(key)) {
      this.events.set(key, value);
      if (key.startsWith("ui:") && !key.endsWith(":result") && !key.endsWith(":audit")) {
        this.promptCount += 1;
      }
    }
  }

  getTimestamp(): number {
    this.now += 10;
    return this.now;
  }
}

afterEach(() => {
  clearHitlChaosPhases();
});

describe("HITL Kill-9 Four-Phase Resume Proof", () => {
  const phases: HitlChaosPhase[] = ["a", "b", "c", "d"];

  phases.forEach((phase) => {
    test(`phase ${phase}: restart preserves one prompt and terminal success`, async () => {
      const workflowId = `wf-kill4-${phase}`;
      const runId = `run-kill4-${phase}`;
      const gateKey = `gate-kill4-${phase}`;
      const resultKey = toHitlResultKey(gateKey);
      const steps = new InMemoryAwaitHumanSteps({ choice: "yes" });

      setHitlChaosPhase(phase, workflowId);

      await expect(
        awaitHuman<{ choice: "yes" }>(
          steps as unknown as IntentWorkflowSteps,
          workflowId,
          runId,
          gateKey,
          { v: 1, title: "Approve?", fields: [{ k: "choice", t: "enum", v: ["yes", "no"] }] },
          60
        )
      ).rejects.toBeInstanceOf(HitlChaosCrashError);

      if (phase === "d") {
        // Phase d crashes after recv, so restart must receive a replayed reply.
        steps.enqueueReply({ choice: "yes" });
      }

      const resumed = await awaitHuman<{ choice: "yes" }>(
        steps as unknown as IntentWorkflowSteps,
        workflowId,
        runId,
        gateKey,
        { v: 1, title: "Approve?", fields: [{ k: "choice", t: "enum", v: ["yes", "no"] }] },
        60
      );

      expect(resumed).toEqual({ ok: true, v: { choice: "yes" } });
      expect(steps.getPromptCount()).toBe(1);
      expect(steps.getOpenCount()).toBe(1);
      expect(steps.getEvent(resultKey)).toMatchObject({
        schemaVersion: 1,
        state: "RECEIVED",
        payload: { choice: "yes" }
      });
    });
  });
});
