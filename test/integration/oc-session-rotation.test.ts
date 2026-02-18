import { beforeAll, describe, expect, it } from "vitest";

import { createReplayWrapper, seedRunningRun } from "./oc-c5-helpers";

describe("OC Session Rotation", () => {
  const wrapper = createReplayWrapper(1000);

  beforeAll(async () => {
    await seedRunningRun({
      runId: "run-rotate",
      intentId: "intent-rotate",
      goal: "test rotation"
    });
    await seedRunningRun({
      runId: "run-rotate-tokens",
      intentId: "intent-rotate-tokens",
      goal: "test rotation by tokens"
    });
  });

  it("rotates when message budget is reached", async () => {
    const firstSession = await wrapper.createSession("run-rotate", "run-rotate");

    for (let i = 1; i <= 20; i += 1) {
      await wrapper.promptStructured(
        firstSession,
        `call ${i}`,
        {},
        {
          runId: "run-rotate",
          stepId: `Step-${i}`,
          attempt: 1,
          producer: async () => ({
            prompt: "hi",
            toolcalls: [],
            responses: [],
            diffs: [],
            structured: {},
            usage: { total_tokens: 10 }
          })
        }
      );
    }

    const rotatedSession = await wrapper.createSession("run-rotate", "run-rotate");
    expect(rotatedSession).not.toBe(firstSession);
  });

  it("rotates when token budget is reached", async () => {
    const firstSession = await wrapper.createSession("run-rotate-tokens", "run-rotate-tokens");

    await wrapper.promptStructured(
      firstSession,
      "big call",
      {},
      {
        runId: "run-rotate-tokens",
        stepId: "Step-Big",
        attempt: 1,
        producer: async () => ({
          prompt: "hi",
          toolcalls: [],
          responses: [],
          diffs: [],
          structured: {},
          usage: { total_tokens: 100001 }
        })
      }
    );

    const rotatedSession = await wrapper.createSession("run-rotate-tokens", "run-rotate-tokens");
    expect(rotatedSession).not.toBe(firstSession);
  });
});
