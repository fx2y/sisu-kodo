import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { DBOS } from "@dbos-inc/dbos-sdk";
import type { Pool } from "pg";
import { createPool, closePool } from "../../src/db/pool";
import { DBOSWorkflowEngine } from "../../src/workflow/engine-dbos";
import { insertIntent } from "../../src/db/intentRepo";
import { startIntentRun } from "../../src/workflow/start-intent";
import { approvePlan } from "../../src/db/planApprovalRepo";
import { generateId } from "../../src/lib/id";
import { findRunById } from "../../src/db/runRepo";
import { IntentSteps } from "../../src/workflow/dbos/intentSteps";
import { RunIntentStepsImpl } from "../../src/workflow/steps/run-intent.steps";
import type {
  OCClientPort,
  OCRunInput,
  OCRunOutput,
  PromptStructuredOptions
} from "../../src/oc/port";
import type { OCOutput } from "../../src/oc/schema";

let pool: Pool;
let workflow: DBOSWorkflowEngine;

beforeAll(async () => {
  await DBOS.launch();
  pool = createPool();
  workflow = new DBOSWorkflowEngine(20);
});

afterAll(async () => {
  await DBOS.shutdown();
  await pool.end();
  await closePool();
});

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
      // Return a command that will be executed in the sandbox
      return { ...base, structured: { patch: [], tests: [], test_command: "TIMEOUT_ME" } };
    }
    return { ...base, structured: {} };
  }
  async revert(_sessionId: string, _messageId: string): Promise<void> {}
  async log(_message: string, _level?: string): Promise<void> {}
  async agents(): Promise<string[]> {
    return ["plan", "build"];
  }
}

describe("SBX timeout workflow proof", () => {
  test("TIMEOUT error projects terminal status and REPAIR action", async () => {
    // Inject mock OC
    const mockOC = new MockOCPort();
    IntentSteps.setImpl(new RunIntentStepsImpl(mockOC));

    // We need to make sure the provider returns TIMEOUT.
    // Our MockProvider returns TIMEOUT if cmd is "TIMEOUT".
    // Wait! Let's check MockProvider in src/sbx/providers/mock.ts.

    const intentId = generateId("it_timeout");
    await insertIntent(pool, intentId, {
      goal: "timeout test",
      inputs: {},
      constraints: {}
    });

    // Override SBX mode to mock for the test
    process.env.SBX_MODE = "mock";

    const { runId } = await startIntentRun(pool, workflow, intentId, { traceId: generateId("tr") });
    await approvePlan(pool, runId, "test");

    // Wait for terminal status
    const handle = DBOS.retrieveWorkflow(intentId);
    try {
      await handle.getResult();
    } catch (_e) {
      // Expected failure
    }

    const runRow = await findRunById(pool, runId);
    expect(runRow?.status).toBe("retries_exceeded");
    expect(runRow?.next_action).toBe("REPAIR");
    // The exact error message depends on how mergeResults handles it.
    // If it's a terminal error (TIMEOUT is terminal in our policy), it throws.
    expect(runRow?.error).toContain("TIMEOUT");

    IntentSteps.resetImpl();
  }, 30000);
});
