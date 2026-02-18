import { beforeAll, describe, expect, it } from "vitest";

import { createReplayWrapper, seedRunningRun } from "./oc-c5-helpers";

describe("OC Bug #6396: Deny Bypass", () => {
  const wrapper = createReplayWrapper(1000);

  beforeAll(async () => {
    await seedRunningRun({
      runId: "run-6396",
      intentId: "intent-6396",
      goal: "test bypass"
    });
  });

  it("denies case-mismatched tools", async () => {
    await expect(
      wrapper.promptStructured(
        "sess-6396",
        "hi",
        {},
        {
          runId: "run-6396",
          stepId: "Step-6396",
          attempt: 1,
          agent: "plan",
          producer: async () => ({
            prompt: "hi",
            toolcalls: [{ name: "Edit", args: {} }],
            responses: [],
            diffs: []
          })
        }
      )
    ).rejects.toThrow("tool-denied: Edit for agent plan");
  });

  it("denies whitespace-padded tools", async () => {
    await expect(
      wrapper.promptStructured(
        "sess-6396",
        "hi",
        {},
        {
          runId: "run-6396",
          stepId: "Step-6396-2",
          attempt: 1,
          agent: "build",
          producer: async () => ({
            prompt: "hi",
            toolcalls: [{ name: " edit", args: {} }],
            responses: [],
            diffs: []
          })
        }
      )
    ).rejects.toThrow("tool-denied:  edit for agent build");
  });
});
