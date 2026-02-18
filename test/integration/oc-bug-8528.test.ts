import { describe, expect, it } from "vitest";

import type { OCRunInput } from "../../src/oc/port";
import { createReplayWrapper } from "./oc-c5-helpers";

describe("OC Bug #8528: Child Session Ban", () => {
  const wrapper = createReplayWrapper(1000);

  it("denies parentID in prompt options", async () => {
    const options = {
      runId: "run-bug-8528",
      stepId: "CompileST",
      attempt: 1,
      parentID: "forbidden-parent"
    } as unknown as {
      runId: string;
      stepId: string;
      attempt: number;
    };

    await expect(
      wrapper.promptStructured("sess-bug-8528", "hi", {}, options)
    ).rejects.toHaveProperty("code", "child_session_denied");
  });

  it("denies nested child-session keys in run input", async () => {
    const input = {
      intent: "nested-forbidden",
      schemaVersion: 1,
      seed: "seed-bug-8528",
      producer: async () => ({
        prompt: "nested-forbidden",
        toolcalls: [],
        responses: [],
        diffs: []
      }),
      metadata: {
        routing: {
          parentSessionId: "forbidden-parent"
        }
      }
    } as unknown as OCRunInput;

    await expect(wrapper.run(input)).rejects.toHaveProperty("code", "child_session_denied");
  });
});
