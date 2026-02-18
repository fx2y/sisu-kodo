import { describe, expect, test } from "vitest";
import { OCWrapper } from "../../src/oc/wrapper";
import { getConfig } from "../../src/config";

describe("plan/build tool deny", () => {
  test("denies write-class tools in plan phase even if provider returns them", async () => {
    const wrapper = new OCWrapper(getConfig());

    await expect(
      wrapper.run({
        intent: "plan tool deny",
        schemaVersion: 1,
        seed: "run-plan-deny",
        mode: "live",
        agent: "plan",
        producer: async () => ({
          prompt: "prompt",
          toolcalls: [{ name: "edit", args: {} }],
          responses: [],
          diffs: [],
          structured: {
            goal: "x",
            design: ["d"],
            files: ["f.ts"],
            risks: ["r"],
            tests: ["t"]
          }
        })
      })
    ).rejects.toThrow("tool-denied: edit for agent plan");
  });
});
