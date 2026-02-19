import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { DBOS } from "@dbos-inc/dbos-sdk";
import type { Pool } from "pg";
import { createPool, closePool } from "../../src/db/pool";
import { insertIntent } from "../../src/db/intentRepo";
import { approvePlan } from "../../src/db/planApprovalRepo";
import { generateId } from "../../src/lib/id";
import { OCMockDaemon } from "../oc-mock-daemon";

// We use any types here because we'll import implementation lazily
let pool: Pool;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let workflow: any;
let daemon: OCMockDaemon;
const daemonPort = 4199;

beforeAll(async () => {
  // Set env vars BEFORE any imports that use them
  process.env.SBX_QUEUE_RATE_LIMIT_PER_PERIOD = "2";
  process.env.SBX_QUEUE_RATE_LIMIT_PERIOD_SEC = "5";
  process.env.OC_BASE_URL = `http://127.0.0.1:${daemonPort}`;
  process.env.OC_MODE = "live";

  // Lazy import modules that depend on env vars or have side effects at module load
  const { DBOSWorkflowEngine } = await import("../../src/workflow/engine-dbos");
  const { IntentSteps } = await import("../../src/workflow/dbos/intentSteps");

  daemon = new OCMockDaemon(daemonPort);
  await daemon.start();

  IntentSteps.resetImpl();

  await DBOS.launch();
  pool = createPool();
  workflow = new DBOSWorkflowEngine(20);
});

afterAll(async () => {
  await DBOS.shutdown();
  if (pool) await pool.end();
  await closePool();
  if (daemon) await daemon.stop();
  const { IntentSteps } = await import("../../src/workflow/dbos/intentSteps");
  await IntentSteps.teardown();
});

describe("queue rate limit", () => {
  test("assert global rate limit ceiling from start timestamps", async () => {
    // We'll start 4 runs. With 2 per 5s, the last ones should take at least 5s to start.
    const intentIds: string[] = [];
    const runIds: string[] = [];

    // Lazy import startIntentRun
    const { startIntentRun } = await import("../../src/workflow/start-intent");

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
        queueName: "intentQ", // Must be intentQ for parents
        queuePartitionKey: "rate-test",
        workload: { concurrency: 1, steps: 1, sandboxMinutes: 1 }
      });
      runIds.push(runId);
      await approvePlan(pool, runId, "test");
    }

    await Promise.all(intentIds.map((id) => workflow.waitUntilComplete(id, 30000)));

    // Assert rate limiting on child tasks (sbxQ) via dbos.workflow_status
    const { getConfig } = await import("../../src/config");
    const sysPool = new (await import("pg")).Pool({
      connectionString: getConfig().systemDatabaseUrl
    });

    try {
      const sbxTasks = await pool.query(
        "SELECT task_key FROM app.sbx_runs WHERE run_id = ANY($1)",
        [runIds]
      );
      const taskKeys = sbxTasks.rows.map((r) => r.task_key);
      expect(taskKeys.length).toBe(4);

      const sysRes = await sysPool.query(
        "SELECT started_at_epoch_ms FROM dbos.workflow_status WHERE workflow_uuid = ANY($1) ORDER BY started_at_epoch_ms ASC",
        [taskKeys]
      );

      const startTimes = sysRes.rows.map((r) => Number(r.started_at_epoch_ms));
      // With 2 per 5s, the 3rd task should start at least 5s after the 1st
      const gap = startTimes[2] - startTimes[0];
      expect(gap).toBeGreaterThan(4500);
    } finally {
      await sysPool.end();
    }

    for (const runId of runIds) {
      const run = await pool.query("SELECT status FROM app.runs WHERE id = $1", [runId]);
      expect(run.rows[0]?.status).toBe("succeeded");
    }
  }, 30000);
});
