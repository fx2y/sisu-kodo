import { describe, expect, test } from "vitest";
import { assertRunRequest } from "../../src/contracts/run-request.schema";

describe("RunRequest schema", () => {
  test("accepts valid minimal request", () => {
    const req = {};
    expect(() => assertRunRequest(req)).not.toThrow();
  });

  test("accepts extension fields (tenantId, taskKey, queuePartitionKey)", () => {
    const req = {
      tenantId: "tenant-123",
      taskKey: "task-456",
      queuePartitionKey: "partition-789"
    };
    expect(() => assertRunRequest(req)).not.toThrow();
  });

  test("rejects invalid types for extension fields", () => {
    const req = {
      tenantId: 123
    };
    expect(() => assertRunRequest(req)).toThrow();
  });

  test("accepts full workload request", () => {
    const req = {
      traceId: "trace-1",
      queueName: "sandboxQ",
      workload: {
        concurrency: 1,
        steps: 1,
        sandboxMinutes: 1
      }
    };
    expect(() => assertRunRequest(req)).not.toThrow();
  });
});
