import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { IntentSteps } from "../../src/workflow/dbos/intentSteps";
import { insertIntent } from "../../src/db/intentRepo";
import { startIntentRun } from "../../src/workflow/start-intent";
import { approvePlan } from "../../src/db/planApprovalRepo";
import { generateId } from "../../src/lib/id";
import { OCMockDaemon } from "../oc-mock-daemon";
import { setupLifecycle, teardownLifecycle, type TestLifecycle } from "./lifecycle";

let lc: TestLifecycle;
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

  lc = await setupLifecycle(20);
});

afterAll(async () => {
  await teardownLifecycle(lc);
  if (daemon) await daemon.stop();
  await IntentSteps.teardown();
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
      await insertIntent(lc.pool, intentId, {
        goal: `goal ${tenant}`,
        inputs: {},
        constraints: {}
      });

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

      const { runId } = await startIntentRun(lc.pool, lc.workflow, intentId, {
        recipeName: "sandbox-default",
        queueName: "intentQ", // Must be intentQ
        queuePartitionKey: tenant,
        workload: { concurrency: 2, steps: 1, sandboxMinutes: 1 }
      });
      runIds.push(runId);
      await approvePlan(lc.pool, runId, "test");
    }

    await Promise.all(intentIds.map((id) => lc.workflow.waitUntilComplete(id, 30000)));

    const { getConfig } = await import("../../src/config");
    const { Pool } = await import("pg");
    const sysPool = new Pool({
      connectionString: getConfig().systemDatabaseUrl
    });

    try {
      for (const runId of runIds) {
        const runRes = await lc.pool.query(
          "SELECT status, queue_partition_key FROM app.runs WHERE id = $1",
          [runId]
        );
        const run = runRes.rows[0];
        expect(run.status).toBe("succeeded");
        expect(run.queue_partition_key).toMatch(/tenant[12]/);

        // Assert DBOS SQL oracle for child tasks
        const sbxRuns = await lc.pool.query("SELECT task_key FROM app.sbx_runs WHERE run_id = $1", [
          runId
        ]);
        for (const sbx of sbxRuns.rows) {
          const sysRes = await sysPool.query(
            "SELECT queue_name, queue_partition_key FROM dbos.workflow_status WHERE workflow_uuid = $1",
            [sbx.task_key]
          );
          expect(sysRes.rows[0].queue_name).toBe("sbxQ");
          expect(sysRes.rows[0].queue_partition_key).toBe(run.queue_partition_key);
        }
      }
    } finally {
      await sysPool.end();
    }
  });
});
