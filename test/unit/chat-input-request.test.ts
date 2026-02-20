import { describe, expect, test } from "vitest";
import {
  buildChatRunRequest,
  DEFAULT_UI_QUEUE_PARTITION_KEY,
  UI_DEFAULT_RECIPE_NAME
} from "../../src/components/chat-input.request";

describe("buildChatRunRequest", () => {
  test("builds strict-mode-compatible payload with deterministic defaults", () => {
    expect(buildChatRunRequest("it_123")).toEqual({
      intentId: "it_123",
      recipeName: UI_DEFAULT_RECIPE_NAME,
      queuePartitionKey: DEFAULT_UI_QUEUE_PARTITION_KEY
    });
  });

  test("accepts explicit queuePartitionKey override", () => {
    expect(buildChatRunRequest("it_456", "tenant-alpha")).toEqual({
      intentId: "it_456",
      recipeName: UI_DEFAULT_RECIPE_NAME,
      queuePartitionKey: "tenant-alpha"
    });
  });

  test("fails closed for blank identifiers", () => {
    expect(() => buildChatRunRequest("")).toThrow("intentId is required");
    expect(() => buildChatRunRequest("it_123", "")).toThrow("queuePartitionKey is required");
  });
});
