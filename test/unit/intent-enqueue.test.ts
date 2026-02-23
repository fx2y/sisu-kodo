import { describe, expect, test } from "vitest";
import {
  buildDBOSClientIntentRunConfig,
  buildDBOSIntentRunConfig,
  toIntentRunWorkflowOptions
} from "../../src/workflow/intent-enqueue";

describe("intent enqueue seam", () => {
  test("preserves partition key for partitioned queues", () => {
    const sbx = toIntentRunWorkflowOptions({
      queueName: "sbxQ",
      priority: 4,
      deduplicationID: "dk",
      timeoutMS: 5000,
      queuePartitionKey: "tenant-a"
    });
    expect(sbx.queuePartitionKey).toBe("tenant-a");

    const intent = toIntentRunWorkflowOptions({
      queueName: "intentQ",
      priority: 4,
      deduplicationID: "dk",
      timeoutMS: 5000,
      queuePartitionKey: "tenant-a"
    });
    expect(intent.queuePartitionKey).toBe("tenant-a");
  });

  test("builds DBOS enqueue config with deterministic defaults", () => {
    const config = buildDBOSIntentRunConfig("ih_123");
    expect(config).toEqual({
      workflowID: "ih_123",
      queueName: "intentQ",
      timeoutMS: undefined,
      enqueueOptions: {
        deduplicationID: undefined,
        priority: undefined,
        queuePartitionKey: undefined
      }
    });
  });

  test("builds DBOS client enqueue config via the same seam", () => {
    const config = buildDBOSClientIntentRunConfig(
      "ih_123",
      {
        queueName: "sbxQ",
        deduplicationID: "dk",
        priority: 2,
        timeoutMS: 2000,
        queuePartitionKey: "tenant-a"
      },
      "v1"
    );
    expect(config).toEqual({
      queueName: "sbxQ",
      workflowClassName: "IntentWorkflow",
      workflowName: "run",
      workflowID: "ih_123",
      workflowTimeoutMS: 2000,
      // Partitioned queues drop dedupe by law (DBOS limitation).
      deduplicationID: undefined,
      priority: 2,
      queuePartitionKey: "tenant-a",
      appVersion: "v1"
    });
  });
});
