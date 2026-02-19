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
const daemonPort = 4199;

beforeAll(async () => {
  daemon = new OCMockDaemon(daemonPort);
  await daemon.start();
  process.env.OC_BASE_URL = `http://127.0.0.1:${daemonPort}`;
  process.env.OC_MODE = "live";

  // Set tight rate limit: 2 starts per 5 seconds
  process.env.SBX_QUEUE_CONCURRENCY = "10";
  process.env.SBX_QUEUE_WORKER_CONCURRENCY = "10";
  process.env.SBX_QUEUE_RATE_LIMIT_PER_PERIOD = "2";
  process.env.SBX_QUEUE_RATE_LIMIT_PERIOD_SEC = "5";

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

describe("queue rate limit", () => {
  test("assert global rate limit ceiling from start timestamps", async () => {
    // We'll start 4 runs. With 2 per 5s, the last ones should take at least 5s to start.
    const intentIds: string[] = [];
    const runIds: string[] = [];

    for (let i = 0; i < 4; i++) {
      const intentId = generateId(`it_rate_${i}`);
      intentIds.push(intentId);
      await insertIntent(pool, intentId, { goal: `goal ${i}`, inputs: {}, constraints: {} });

      daemon.pushAgentResponse("plan", {
        info: {
          id: `msg-plan-${i}`,
          structured_output: {
            goal: `goal ${i}`,
            design: ["design"],
            files: [],
            risks: [],
            tests: ["t1.ts"]
          },
          tool_calls: []
        },
        messages: [],
        usage: { total_tokens: 10 }
      });
      daemon.pushAgentResponse("build", {
        info: {
          id: `msg-build-${i}`,
          structured_output: { patch: [], tests: ["t1.ts"], test_command: "echo" },
          tool_calls: []
        },
        messages: [],
        usage: { total_tokens: 10 }
      });

      const { runId } = await startIntentRun(pool, workflow, intentId, {
        recipeName: "sandbox-default",
        queueName: "sbxQ",
        queuePartitionKey: "rate-test",
        workload: { concurrency: 1, steps: 1, sandboxMinutes: 1 }
      });
      runIds.push(runId);
      await approvePlan(pool, runId, "test");
    }

    const start = Date.now();
    await Promise.all(intentIds.map((id) => workflow.waitUntilComplete(id, 30000)));
    const duration = Date.now() - start;

    // With 2 per 5s, 4 tasks should take at least 5 seconds.
    // 1, 2 start immediately (or close to it)
    // 3, 4 start after 5 seconds.
    expect(duration).toBeGreaterThan(4500);

    for (const runId of runIds) {
      const run = await pool.query("SELECT status FROM app.runs WHERE id = $1", [runId]);
      expect(run.rows[0]?.status).toBe("succeeded");
    }
  });
});
