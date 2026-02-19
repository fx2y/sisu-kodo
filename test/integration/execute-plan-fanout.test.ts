import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { DBOS } from "@dbos-inc/dbos-sdk";
import type { Pool } from "pg";
import { createPool, closePool } from "../../src/db/pool";
import { DBOSWorkflowEngine } from "../../src/workflow/engine-dbos";
import { IntentSteps } from "../../src/workflow/dbos/intentSteps";
import { insertIntent } from "../../src/db/intentRepo";
import { startIntentRun } from "../../src/workflow/start-intent";
import { approvePlan } from "../../src/db/planApprovalRepo";
import { generateId } from "../../src/lib/id";
import { OCMockDaemon } from "../oc-mock-daemon";

let pool: Pool;
let workflow: DBOSWorkflowEngine;
let daemon: OCMockDaemon;
const daemonPort = 4197;

beforeAll(async () => {
  daemon = new OCMockDaemon(daemonPort);
  await daemon.start();
  process.env.OC_BASE_URL = `http://127.0.0.1:${daemonPort}`;
  process.env.OC_MODE = "live";
  IntentSteps.resetImpl();

  await DBOS.launch();
  pool = createPool();
  workflow = new DBOSWorkflowEngine(20);
});

afterAll(async () => {
  await DBOS.shutdown();
  await pool.end();
  await closePool();
  await daemon.stop();
});

describe("execute plan fanout", () => {
  test("runs multiple tasks in parallel and aggregates results", async () => {
    const intentId = generateId("it_fanout");
    await insertIntent(pool, intentId, {
      goal: "fanout test",
      inputs: {},
      constraints: {}
    });

    // Mock CompileST (plan agent)
    daemon.pushResponse({
      info: {
        id: "msg-plan-ok",
        structured_output: {
          goal: "fanout test",
          design: ["design"],
          files: ["file.ts"],
          risks: ["none"],
          tests: ["test1.ts", "test2.ts", "test3.ts"]
        },
        tool_calls: []
      },
      messages: [{ type: "text", text: "mock plan response" }],
      usage: { total_tokens: 100 }
    });

    // Mock DecideST (build agent)
    daemon.pushResponse({
      info: {
        id: "msg-build-fanout",
        structured_output: {
          patch: [],
          tests: ["test1.ts", "test2.ts", "test3.ts"],
          test_command: "echo running"
        },
        tool_calls: []
      },
      messages: [{ type: "text", text: "mock build response" }],
      usage: { total_tokens: 100 }
    });

    const { runId } = await startIntentRun(pool, workflow, intentId, {
      recipeName: "sandbox-default",
      queueName: "sbxQ",
      queuePartitionKey: "fanout-test",
      workload: {
        concurrency: 5,
        steps: 1,
        sandboxMinutes: 1
      }
    });

    await approvePlan(pool, runId, "test");
    await workflow.waitUntilComplete(intentId, 30000);

    const run = await pool.query("SELECT status FROM app.runs WHERE id = $1", [runId]);
    expect(run.rows[0]?.status).toBe("succeeded");

    // Check that we have 3 sbx_runs rows (one for each task)
    // Wait, our implementation of buildTasks returns 3 requests.
    // Each request is executed by taskWorkflow which calls executeTask step.
    const sbxRuns = await pool.query(
      "SELECT COUNT(*)::text AS c FROM app.sbx_runs WHERE run_id = $1",
      [runId]
    );
    expect(Number(sbxRuns.rows[0].c)).toBe(3);

    // Check that results are aggregated
    const executeStep = await pool.query(
      "SELECT output FROM app.run_steps WHERE run_id = $1 AND step_id = 'ExecuteST'",
      [runId]
    );
    const output = executeStep.rows[0].output;
    expect(output.stdout).toContain("OK: echo running test1.ts");
    expect(output.stdout).toContain("OK: echo running test2.ts");
    expect(output.stdout).toContain("OK: echo running test3.ts");
  });
});
