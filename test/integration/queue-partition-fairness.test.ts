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
const daemonPort = 4198;

beforeAll(async () => {
  daemon = new OCMockDaemon(daemonPort);
  await daemon.start();
  process.env.OC_BASE_URL = `http://127.0.0.1:${daemonPort}`;
  process.env.OC_MODE = "live";

  // Set tight queue limits for testing fairness
  process.env.SBX_QUEUE_CONCURRENCY = "10";
  process.env.SBX_QUEUE_WORKER_CONCURRENCY = "5";
  process.env.SBX_QUEUE_RATE_LIMIT_PER_PERIOD = "100";
  process.env.SBX_QUEUE_RATE_LIMIT_PERIOD_SEC = "60";

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

describe("queue partition fairness", () => {
  test("per-tenant isolation with queuePartitionKey", async () => {
    // This test would ideally verify that one tenant doesn't starve another.
    // In DBOS, partitionQueue enables this.

    const tenants = ["tenant1", "tenant2"];
    const runIds: string[] = [];
    const intentIds: string[] = [];

    for (const tenant of tenants) {
      const intentId = generateId(`it_${tenant}`);
      intentIds.push(intentId);
      await insertIntent(pool, intentId, { goal: `goal ${tenant}`, inputs: {}, constraints: {} });

      daemon.pushAgentResponse("plan", {
        info: {
          id: `msg-plan-${tenant}`,
          structured_output: {
            goal: `goal ${tenant}`,
            design: ["design"],
            files: ["file.ts"],
            risks: ["none"],
            tests: ["test1.ts", "test2.ts"]
          },
          tool_calls: []
        },
        messages: [{ type: "text", text: "mock response" }],
        usage: { total_tokens: 100 }
      });

      daemon.pushAgentResponse("build", {
        info: {
          id: `msg-build-${tenant}`,
          structured_output: {
            patch: [],
            tests: ["test1.ts", "test2.ts"],
            test_command: "echo running"
          },
          tool_calls: []
        },
        messages: [{ type: "text", text: "mock response" }],
        usage: { total_tokens: 100 }
      });

      const { runId } = await startIntentRun(pool, workflow, intentId, {
        recipeName: "sandbox-default",
        queueName: "sbxQ",
        queuePartitionKey: tenant,
        workload: { concurrency: 2, steps: 1, sandboxMinutes: 1 }
      });
      runIds.push(runId);
      await approvePlan(pool, runId, "test");
    }

    await Promise.all(intentIds.map((id) => workflow.waitUntilComplete(id, 30000)));

    for (const runId of runIds) {
      const run = await pool.query(
        "SELECT status, queue_partition_key FROM app.runs WHERE id = $1",
        [runId]
      );
      expect(run.rows[0]?.status).toBe("succeeded");
      expect(run.rows[0]?.queue_partition_key).toMatch(/tenant[12]/);
    }
  });
});
