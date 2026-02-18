import { describe, it, expect } from "vitest";
import { buildTaskKey } from "../../src/workflow/task-key";

describe("taskKey determinism", () => {
  it("should generate same key for identical inputs", () => {
    const input1 = {
      intentId: "intent-1",
      runId: "run-1",
      stepId: "ExecuteST",
      normalizedReq: { cmd: "ls", env: { FOO: "bar" } }
    };
    const input2 = {
      intentId: "intent-1",
      runId: "run-1",
      stepId: "ExecuteST",
      normalizedReq: { env: { FOO: "bar" }, cmd: "ls" } // different key order
    };

    const key1 = buildTaskKey(input1);
    const key2 = buildTaskKey(input2);

    expect(key1).toBe(key2);
    expect(key1).toMatch(/^[0-9a-f]{64}$/);
  });

  it("should generate different keys for different inputs", () => {
    const key1 = buildTaskKey({
      intentId: "intent-1",
      runId: "run-1",
      stepId: "ExecuteST",
      normalizedReq: { cmd: "ls" }
    });
    const key2 = buildTaskKey({
      intentId: "intent-1",
      runId: "run-1",
      stepId: "ExecuteST",
      normalizedReq: { cmd: "ls -la" }
    });

    expect(key1).not.toBe(key2);
  });

  it("should ignore object key order and undefined object fields", () => {
    const key1 = buildTaskKey({
      intentId: "intent-1",
      runId: "run-1",
      stepId: "ExecuteST",
      normalizedReq: {
        cmd: "pnpm test",
        flags: { retry: false, verbose: true }
      }
    });

    const key2 = buildTaskKey({
      intentId: "intent-1",
      runId: "run-1",
      stepId: "ExecuteST",
      normalizedReq: {
        flags: { verbose: true, retry: false, unused: undefined },
        cmd: "pnpm test"
      }
    });

    expect(key1).toBe(key2);
  });
});
