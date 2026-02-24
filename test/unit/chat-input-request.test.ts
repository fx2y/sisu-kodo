import { describe, expect, test } from "vitest";
import {
  buildChatRunStartRequest,
  DEFAULT_UI_QUEUE_PARTITION_KEY,
  UI_DEFAULT_RECIPE_ID,
  UI_DEFAULT_RECIPE_V
} from "../../src/components/chat-input.request";

describe("buildChatRunStartRequest", () => {
  test("builds strict-mode-compatible payload with deterministic defaults", () => {
    expect(buildChatRunStartRequest("test goal")).toEqual({
      recipeRef: { id: UI_DEFAULT_RECIPE_ID, v: UI_DEFAULT_RECIPE_V },
      formData: { goal: "test goal" },
      opts: {
        queuePartitionKey: DEFAULT_UI_QUEUE_PARTITION_KEY,
        lane: "interactive"
      }
    });
  });

  test("accepts explicit queuePartitionKey override", () => {
    expect(buildChatRunStartRequest("test goal", "tenant-alpha")).toEqual({
      recipeRef: { id: UI_DEFAULT_RECIPE_ID, v: UI_DEFAULT_RECIPE_V },
      formData: { goal: "test goal" },
      opts: {
        queuePartitionKey: "tenant-alpha",
        lane: "interactive"
      }
    });
  });

  test("fails closed for blank goal", () => {
    expect(() => buildChatRunStartRequest("")).toThrow("goal is required");
  });
});
