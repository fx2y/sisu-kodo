import { beforeAll, describe, expect, it } from "vitest";

import { createReplayWrapper, seedRunningRun } from "./oc-c5-helpers";

describe("OC Bug #11064: Stall Detector", () => {
  const wrapper = createReplayWrapper(200);

  beforeAll(async () => {
    await seedRunningRun({
      runId: "run-stall",
      intentId: "intent-stall",
      goal: "test stall"
    });
    await seedRunningRun({
      runId: "run-ok",
      intentId: "intent-ok",
      goal: "test non-stall"
    });
  });

  it("throws oc_timeout_terminal when producer stalls", async () => {
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
        "sess-stall",
        "hi",
        {},
        {
          runId: "run-stall",
          stepId: "StepStall",
          attempt: 1,
          producer: slowProducer
        }
      )
    ).rejects.toHaveProperty("code", "oc_timeout_terminal");
  });

  it("does not fail when producer is responsive", async () => {
    const fastProducer = async () => ({
      prompt: "hi",
      toolcalls: [],
      responses: [],
      diffs: [],
      structured: {}
    });

    await expect(
      wrapper.promptStructured(
        "sess-ok",
        "hi",
        {},
        {
          runId: "run-ok",
          stepId: "StepOk",
          attempt: 1,
          producer: fastProducer
        }
      )
    ).resolves.toBeDefined();
  });
});
