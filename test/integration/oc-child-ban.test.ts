import { describe, expect, it } from "vitest";

import { WorkflowError } from "../../src/contracts/error";
import type { OCRunInput, PromptStructuredOptions } from "../../src/oc/port";
import { createReplayWrapper } from "./oc-c5-helpers";

function optionsWithForbiddenKey(key: string): PromptStructuredOptions {
  return {
    runId: "run-child-ban",
    stepId: "CompileST",
    attempt: 1,
    [key]: "blocked"
  } as unknown as PromptStructuredOptions;
}

function runInputWithForbiddenKey(key: string): OCRunInput {
  return {
    intent: "hi",
    schemaVersion: 1,
    seed: "seed-child-ban",
    producer: async () => ({
      prompt: "hi",
      toolcalls: [],
      responses: [],
      diffs: []
    }),
    [key]: "blocked"
  } as unknown as OCRunInput;
}

describe("OC child-session ban", () => {
  const wrapper = createReplayWrapper(1000);

  it("rejects forbidden key in createSession payload", async () => {
    const titleWithForbiddenKey = { parentID: "blocked" } as unknown as string;
    await expect(wrapper.createSession("run-child-ban", titleWithForbiddenKey)).rejects.toThrow(
      WorkflowError
    );
    await expect(
      wrapper.createSession("run-child-ban", titleWithForbiddenKey)
    ).rejects.toHaveProperty("code", "child_session_denied");
  });

  it("rejects forbidden keys in promptStructured options", async () => {
    await expect(
      wrapper.promptStructured("sess-child-ban", "hi", {}, optionsWithForbiddenKey("parentID"))
    ).rejects.toThrow(WorkflowError);

    await expect(
      wrapper.promptStructured("sess-child-ban", "hi", {}, optionsWithForbiddenKey("parent_id"))
    ).rejects.toHaveProperty("code", "child_session_denied");
  });

  it("rejects forbidden key in run input", async () => {
    await expect(wrapper.run(runInputWithForbiddenKey("parentID"))).rejects.toHaveProperty(
      "code",
      "child_session_denied"
    );
  });
});
