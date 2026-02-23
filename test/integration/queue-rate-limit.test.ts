import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { insertIntent } from "../../src/db/intentRepo";
import { approvePlan } from "../../src/db/planApprovalRepo";
import { generateId } from "../../src/lib/id";
import { setRngSeed } from "../../src/lib/rng";
import { OCMockDaemon } from "../oc-mock-daemon";
import { setupLifecycle, teardownLifecycle, type TestLifecycle } from "./lifecycle";

// We use any types here because we'll import implementation lazily
let lc: TestLifecycle;
let daemon: OCMockDaemon;
const daemonPort = 4199;
const laneTag = process.env.PORT ?? "p0";
let runNonce = "boot";

beforeAll(async () => {
  setRngSeed(0x52f20000 + Number(process.env.PORT ?? 0));
  // Set env vars BEFORE any imports that use them
  process.env.SBX_QUEUE_RATE_LIMIT_PER_PERIOD = "2";
  process.env.SBX_QUEUE_RATE_LIMIT_PERIOD_SEC = "5";
  process.env.SBX_QUEUE_WORKER_CONCURRENCY = "1";
  process.env.SBX_QUEUE_CONCURRENCY = "1";
  process.env.CHAOS_SLEEP_EXECUTE = "1200";
  process.env.OC_BASE_URL = `http://127.0.0.1:${daemonPort}`;
  process.env.OC_MODE = "live";

  // Lazy import modules that depend on env vars or have side effects at module load
  const { IntentSteps } = await import("../../src/workflow/dbos/intentSteps");

  daemon = new OCMockDaemon(daemonPort);
  await daemon.start();

  IntentSteps.resetImpl();

  lc = await setupLifecycle(20);
  const nonceRes = await lc.pool.query<{ id: string }>("SELECT gen_random_uuid()::text AS id");
  runNonce = nonceRes.rows[0].id.slice(0, 8);
});

afterAll(async () => {
  await teardownLifecycle(lc);
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
      const intentId = generateId(`it_rate_${laneTag}_${runNonce}_${i}`);
      intentIds.push(intentId);
      await insertIntent(lc.pool, intentId, { goal: `goal ${i}`, inputs: {}, constraints: {} });

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

      setRngSeed(0x52f21000 + Number(process.env.PORT ?? 0) + i);
      const { runId } = await startIntentRun(lc.pool, lc.workflow, intentId, {
        recipeName: "sandbox-default",
        queueName: "intentQ", // Must be intentQ for parents
        queuePartitionKey: "rate-test",
        workload: { concurrency: 1, steps: 1, sandboxMinutes: 1 }
      });
      runIds.push(runId);
      await approvePlan(lc.pool, runId, "test");
    }

    await Promise.all(intentIds.map((id) => lc.workflow.waitUntilComplete(id, 30000)));

    // Assert rate limiting on child tasks (sbxQ) via dbos.workflow_status
    const { getConfig } = await import("../../src/config");
    const sysPool = new (await import("pg")).Pool({
      connectionString: getConfig().systemDatabaseUrl
    });

    try {
      const sbxTasks = await lc.pool.query(
        "SELECT DISTINCT task_key, run_id FROM app.sbx_runs WHERE run_id = ANY($1)",
        [runIds]
      );
      const taskKeys = sbxTasks.rows.map((r) => r.task_key);
      expect(taskKeys.length).toBeGreaterThanOrEqual(4);

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
      const run = await lc.pool.query("SELECT status FROM app.runs WHERE id = $1", [runId]);
      expect(run.rows[0]?.status).toBe("succeeded");
    }
  }, 35000);

  test("assert worker cap serializes child starts", async () => {
    const intentIds: string[] = [];
    const runIds: string[] = [];
    const { startIntentRun } = await import("../../src/workflow/start-intent");

    for (let i = 0; i < 2; i++) {
      const intentId = generateId(`it_cap_${laneTag}_${runNonce}_${i}`);
      intentIds.push(intentId);
      await insertIntent(lc.pool, intentId, { goal: `cap ${i}`, inputs: {}, constraints: {} });

      daemon.pushAgentResponse("plan", {
        info: {
          id: `msg-cap-plan-${i}`,
          structured_output: {
            goal: `cap ${i}`,
            design: ["d"],
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
          id: `msg-cap-build-${i}`,
          structured_output: { patch: [], tests: ["t1.ts"], test_command: "echo" },
          tool_calls: []
        },
        messages: [],
        usage: { total_tokens: 10 }
      });

      setRngSeed(0x52f22000 + Number(process.env.PORT ?? 0) + i);
      const { runId } = await startIntentRun(lc.pool, lc.workflow, intentId, {
        recipeName: "sandbox-default",
        queueName: "intentQ",
        queuePartitionKey: "rate-test",
        workload: { concurrency: 1, steps: 1, sandboxMinutes: 1 }
      });
      runIds.push(runId);
      await approvePlan(lc.pool, runId, "test");
    }

    await Promise.all(intentIds.map((id) => lc.workflow.waitUntilComplete(id, 30000)));

    const { getConfig } = await import("../../src/config");
    const sysPool = new (await import("pg")).Pool({
      connectionString: getConfig().systemDatabaseUrl
    });

    try {
      const sbxTasks = await lc.pool.query(
        "SELECT DISTINCT task_key FROM app.sbx_runs WHERE run_id = ANY($1) ORDER BY task_key ASC",
        [runIds]
      );
      const taskKeys = sbxTasks.rows.map((r) => r.task_key);
      expect(taskKeys.length).toBe(2);

      const sysRes = await sysPool.query(
        "SELECT started_at_epoch_ms FROM dbos.workflow_status WHERE workflow_uuid = ANY($1) ORDER BY started_at_epoch_ms ASC",
        [taskKeys]
      );
      const startTimes = sysRes.rows.map((r) => Number(r.started_at_epoch_ms));
      expect(startTimes.length).toBe(2);
      expect(startTimes[1] - startTimes[0]).toBeGreaterThan(900);
    } finally {
      await sysPool.end();
    }
  }, 35000);
});
