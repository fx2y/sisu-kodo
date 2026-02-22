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

  test("accepts lane metadata", () => {
    const req = {
      lane: "batch"
    };
    expect(() => assertRunRequest(req)).not.toThrow();
  });

  test("rejects unknown lane metadata", () => {
    const req = {
      lane: "realtime"
    };
    expect(() => assertRunRequest(req)).toThrow();
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
      queueName: "sbxQ",
      workload: {
        concurrency: 1,
        steps: 1,
        sandboxMinutes: 1
      }
    };
    expect(() => assertRunRequest(req)).not.toThrow();
  });

  test("accepts strict budget object", () => {
    const req = {
      budget: {
        maxFanout: 2,
        maxSBXMinutes: 5,
        maxArtifactsMB: 1,
        maxRetriesPerStep: 0,
        maxWallClockMS: 1000
      }
    };
    expect(() => assertRunRequest(req)).not.toThrow();
  });

  test("rejects unknown budget fields", () => {
    const req = {
      budget: {
        maxFanout: 2,
        maxSBXMinutes: 5,
        maxArtifactsMB: 1,
        maxRetriesPerStep: 0,
        maxWallClockMS: 1000,
        extra: true
      }
    };
    expect(() => assertRunRequest(req)).toThrow();
  });
});
