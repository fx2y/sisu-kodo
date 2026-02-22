import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { insertIntent } from "../../src/db/intentRepo";
import { startIntentRun } from "../../src/workflow/start-intent";
import { findRunById } from "../../src/db/runRepo";
import { approvePlan } from "../../src/db/planApprovalRepo";
import { generateId } from "../../src/lib/id";
import { setupLifecycle, teardownLifecycle, type TestLifecycle } from "./lifecycle";
import { IntentSteps } from "../../src/workflow/dbos/intentSteps";
import { RunIntentStepsImpl } from "../../src/workflow/steps/run-intent.steps";
import type { OCClientPort } from "../../src/oc/port";
import type { OCRunInput, OCRunOutput, PromptStructuredOptions } from "../../src/oc/port";
import type { OCOutput } from "../../src/oc/schema";

let lc: TestLifecycle;

class MockOCPort implements OCClientPort {
  async health(): Promise<void> {}
  async run(_params: OCRunInput): Promise<OCRunOutput> {
    return { key: "test", payload: { prompt: "", toolcalls: [], responses: [], diffs: [] } };
  }
  async createSession(_runId: string, _title: string): Promise<string> {
    return "test-sess";
  }
  async promptStructured(
    _sessionId: string,
    prompt: string,
    _schema: Record<string, unknown>,
    options: PromptStructuredOptions
  ): Promise<OCOutput> {
    const base = { prompt: "test", toolcalls: [], responses: [], diffs: [] };
    if (options.stepId === "CompileST") {
      return { ...base, structured: { design: ["Design"], files: [], risks: [], tests: [] } };
    }
    if (options.stepId === "ApplyPatchST") {
      return { ...base, structured: {} };
    }
    if (options.stepId === "DecideST") {
      if (prompt.includes("fail me")) {
        return { ...base, structured: { patch: [], tests: [], test_command: "FAIL_ME" } };
      }
      return { ...base, structured: { patch: [], tests: [], test_command: "ls" } };
    }
    return { ...base, structured: {} };
  }
  async revert(_sessionId: string, _messageId: string): Promise<void> {}
  async log(_message: string, _level?: string): Promise<void> {}
  async agents(): Promise<string[]> {
    return ["plan", "build"];
  }
}

beforeAll(async () => {
  lc = await setupLifecycle(20);
});

afterAll(async () => {
  await teardownLifecycle(lc);
});

describe("workflow recovery caps and retries exceeded", () => {
  test("run projects terminal retries_exceeded + repair action", async () => {
    try {
      IntentSteps.setImpl(new RunIntentStepsImpl(new MockOCPort()));
      const intentId = generateId("it_fail");
      await insertIntent(lc.pool, intentId, {
        goal: "fail me",
        inputs: { cmd: "FAIL_ME" },
        constraints: {}
      });

      const { runId } = await startIntentRun(lc.pool, lc.workflow, intentId, {
        traceId: "test-fail-trace",
        queuePartitionKey: "test-partition"
      });
      await approvePlan(lc.pool, runId, "test");

      // Use waitUntilComplete instead of manual polling
      try {
        await lc.workflow.waitUntilComplete(intentId, 25000);
      } catch (_e) {
        // Expected failure path in this test
      }

      const run = await findRunById(lc.pool, runId);
      expect(run).toBeDefined();
      expect(run?.status).toBe("retries_exceeded");
      expect(run?.retry_count).toBe(0);
      expect(run?.error).toBe("SBX execution failed [CMD_NONZERO]");
      expect(run?.next_action).toBe("REPAIR");
    } finally {
      IntentSteps.resetImpl();
    }
  }, 30000);
});
