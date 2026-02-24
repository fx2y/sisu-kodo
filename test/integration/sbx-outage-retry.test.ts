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
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { IntentWorkflow } from "../../src/workflow/dbos/intentWorkflow";
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
  try {
    for (const status of ["PENDING", "ENQUEUED"] as const) {
      const active = await workflow.listWorkflows({ status, limit: 100 });
      await Promise.allSettled(active.map((wf) => workflow.cancelWorkflow(wf.workflowID)));
    }
  } catch (e) {
    console.error("[SBX-OUTAGE-RETRY-CLEANUP] Failed to cancel workflows:", e);
  }
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
      return { ...base, structured: { patch: [], tests: [], test_command: "INFRA_FAIL" } };
    }
    return { ...base, structured: {} };
  }
  async revert(_sessionId: string, _messageId: string): Promise<void> {}
  async log(_message: string, _level?: string): Promise<void> {}
  async agents(): Promise<string[]> {
    return ["plan", "build"];
  }
}

describe("Provider outage retry proof", () => {
  test("BOOT_FAIL exhausts retries and projects terminal status", async () => {
    // Inject mock OC that returns INFRA_FAIL
    const mockOC = new MockOCPort();
    IntentSteps.setImpl(new RunIntentStepsImpl(mockOC));

    const intentId = generateId("it_outage");
    await insertIntent(pool, intentId, {
      goal: "infra fail test",
      inputs: {},
      constraints: {}
    });

    const run = await startIntentRun(pool, workflow, intentId, {
      traceId: generateId("tr"),
      queuePartitionKey: "test-partition"
    });
    await approvePlan(pool, run.runId, "test");

    // Wait for terminal status
    const handle = DBOS.retrieveWorkflow(intentId);
    try {
      await handle.getResult();
    } catch (_e) {
      // Expected failure
    }

    const runRow = await findRunById(pool, run.runId);
    expect(runRow?.status).toBe("retries_exceeded");
    expect(runRow?.next_action).toBe("REPAIR");
    // DBOS error message when step retries are exceeded
    expect(runRow?.error).toContain("exceeded its maximum of 3 retries");
    expect(runRow?.error).toContain("BOOT_FAIL");

    // Verify child task (taskWorkflow) also failed
    // Task key for single task is buildTaskKey with normalizedReq: { cmd: "INFRA_FAIL" }
    // But it's easier to check app.run_steps
    const runSteps = await pool.query(
      "SELECT output FROM app.run_steps WHERE run_id = $1 AND step_id = 'ExecuteST'",
      [run.runId]
    );
    // Since it failed terminaly, ExecuteST should NOT have been saved yet?
    // Wait, in runCoreSteps:
    /*
      const results = await Promise.all(handles.map((h) => h.getResult()));
      const finalResult = mergeResults(results);
      await steps.saveExecuteStep(runId, finalResult, decision);
    */
    // If getResult() throws, saveExecuteStep is NOT called.
    expect(runSteps.rowCount).toBe(0);

    IntentSteps.resetImpl();
  }, 30000);
});
