import { beforeAll, describe, expect, it } from "vitest";

import { createReplayWrapper, seedRunningRun } from "./oc-c5-helpers";

describe("OC Timeout Revert Policy", () => {
  const wrapper = createReplayWrapper(200);

  beforeAll(async () => {
    await seedRunningRun({
      runId: "run-timeout",
      intentId: "intent-timeout",
      goal: "test timeout"
    });
  });

  it("reverts and retries once with tightened scope", async () => {
    let attempts = 0;
    const flappyProducer = async () => {
      attempts += 1;
      if (attempts === 1) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      return {
        prompt: "hi",
        toolcalls: [],
        responses: [],
        diffs: [],
        structured: { attempts }
      };
    };

    const res = await wrapper.promptStructured(
      "sess-timeout",
      "hi",
      {},
      {
        runId: "run-timeout",
        stepId: "StepTimeout",
        attempt: 1,
        producer: flappyProducer
      }
    );

    expect(attempts).toBe(2);
    expect(res.structured).toEqual({ attempts: 2 });
  });

  it("fails deterministically if retry stalls again", async () => {
    const slowProducer = async () => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      return {
        prompt: "hi",
        toolcalls: [],
        responses: [],
        diffs: [],
        structured: {}
      };
    };

    await expect(
      wrapper.promptStructured(
        "sess-timeout2",
        "hi",
        {},
        {
          runId: "run-timeout",
          stepId: "StepTerminal",
          attempt: 1,
          producer: slowProducer
        }
      )
    ).rejects.toHaveProperty("code", "oc_timeout_terminal");
  });
});
