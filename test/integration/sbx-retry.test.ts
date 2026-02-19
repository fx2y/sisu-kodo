import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { DBOS } from "@dbos-inc/dbos-sdk";
import type { Pool } from "pg";
import { createPool, closePool } from "../../src/db/pool";
import { DBOSWorkflowEngine } from "../../src/workflow/engine-dbos";
import { insertIntent } from "../../src/db/intentRepo";
import { startIntentRun } from "../../src/workflow/start-intent";
import { approvePlan } from "../../src/db/planApprovalRepo";
import { generateId } from "../../src/lib/id";
import { resetMockInjectedFailCount } from "../../src/sbx/providers/mock";
import { IntentSteps } from "../../src/workflow/dbos/intentSteps";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { IntentWorkflow } from "../../src/workflow/dbos/intentWorkflow";
import { RunIntentStepsImpl } from "../../src/workflow/steps/run-intent.steps";
import type { OCClientPort } from "../../src/oc/port";
import type { OCRunInput, OCRunOutput, PromptStructuredOptions } from "../../src/oc/port";
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
    console.log(`MOCK_OC_PROMPT: step=${options.stepId} run=${options.runId}`);
    const base = { prompt: "test", toolcalls: [], responses: [], diffs: [] };
    if (options.stepId === "CompileST") {
      return { ...base, structured: { design: ["Design"], files: [], risks: [], tests: [] } };
    }
    if (options.stepId === "ApplyPatchST") {
      return { ...base, structured: {} };
    }
    if (options.stepId === "DecideST") {
      if (prompt.includes("flaky test")) {
        return { ...base, structured: { patch: [], tests: [], test_command: "FLAKY_INFRA_FAIL" } };
      }
      if (prompt.includes("fail me")) {
        return { ...base, structured: { patch: [], tests: [], test_command: "FAIL_ME" } };
      }
      if (prompt.includes("hard fail")) {
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

describe("SBX retry behavior", () => {
  test("retries on BOOT_FAIL but succeeds eventually", async () => {
    resetMockInjectedFailCount();

    // Inject mock OC
    const mockOC = new MockOCPort();
    const impl = new RunIntentStepsImpl(mockOC);
    IntentSteps.setImpl(impl);

    const intentId = generateId("it_retry");
    await insertIntent(pool, intentId, {
      goal: "flaky test",
      inputs: {},
      constraints: {}
    });

    const run = await startIntentRun(pool, workflow, intentId, {
      traceId: generateId("tr"),
      queuePartitionKey: "test-partition"
    });
    await approvePlan(pool, run.runId, "test");

    await workflow.waitUntilComplete(intentId, 15000);

    const runSteps = await pool.query<{ attempt: number; err_code: string }>(
      `SELECT (output ->> 'attempt')::INT as attempt, 
              output ->> 'errCode' as err_code
       FROM app.run_steps
       WHERE run_id = $1 AND step_id = 'ExecuteST'`,
      [run.runId]
    );

    expect(runSteps.rowCount).toBe(1);
    expect(runSteps.rows[0].attempt).toBe(3);
    expect(runSteps.rows[0].err_code).toBe("NONE");

    const sbxRun = await pool.query(
      "SELECT * FROM app.sbx_runs WHERE run_id = $1 ORDER BY attempt DESC",
      [run.runId]
    );
    expect(sbxRun.rowCount).toBe(3);
    expect(sbxRun.rows[0].response.errCode).toBe("NONE");

    // Clean up
    IntentSteps.resetImpl();
  }, 30000);

  test("does not retry CMD_NONZERO failures", async () => {
    resetMockInjectedFailCount();
    const mockOC = new MockOCPort();
    IntentSteps.setImpl(new RunIntentStepsImpl(mockOC));

    const intentId = generateId("it_cmd_nonzero");
    await insertIntent(pool, intentId, {
      goal: "fail me",
      inputs: {},
      constraints: {}
    });

    const run = await startIntentRun(pool, workflow, intentId, {
      traceId: generateId("tr"),
      queuePartitionKey: "test-partition"
    });
    await approvePlan(pool, run.runId, "test");

    await expect(workflow.waitUntilComplete(intentId, 15000)).rejects.toBeInstanceOf(Error);

    const runSteps = await pool.query<{ attempt: number; err_code: string }>(
      `SELECT (output ->> 'attempt')::INT as attempt,
              output ->> 'errCode' as err_code
       FROM app.run_steps
       WHERE run_id = $1 AND step_id = 'ExecuteST'`,
      [run.runId]
    );
    expect(runSteps.rowCount).toBe(1);
    expect(runSteps.rows[0].attempt).toBe(1);
    expect(runSteps.rows[0].err_code).toBe("CMD_NONZERO");

    const runRow = await pool.query<{ status: string }>(
      "SELECT status FROM app.runs WHERE id = $1",
      [run.runId]
    );
    expect(runRow.rows[0]?.status).toBe("retries_exceeded");

    IntentSteps.resetImpl();
  }, 30000);
});
