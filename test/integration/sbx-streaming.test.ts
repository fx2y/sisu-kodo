import { afterAll, beforeAll, describe, expect, test, beforeEach } from "vitest";
import { IntentSteps } from "../../src/workflow/dbos/intentSteps";
import { insertIntent } from "../../src/db/intentRepo";
import { startIntentRun } from "../../src/workflow/start-intent";
import { approvePlan } from "../../src/db/planApprovalRepo";
import { generateId } from "../../src/lib/id";
import { OCMockDaemon } from "../oc-mock-daemon";
import { setupLifecycle, teardownLifecycle, type TestLifecycle } from "./lifecycle";

import { setRngSeed } from "../../src/lib/rng";

let lc: TestLifecycle;
let daemon: OCMockDaemon;
const daemonPort = 4198;

beforeAll(async () => {
  setRngSeed(Date.now());
  daemon = new OCMockDaemon(daemonPort);
  await daemon.start();
  process.env.OC_BASE_URL = `http://127.0.0.1:${daemonPort}`;
  process.env.OC_MODE = "live";
  IntentSteps.resetImpl();

  lc = await setupLifecycle(20);
});

afterAll(async () => {
  await teardownLifecycle(lc);
  await daemon.stop();
});

beforeEach(async () => {
  await lc.pool.query(
    "TRUNCATE app.intents, app.runs, app.run_steps, app.artifacts, app.sbx_runs CASCADE"
  );
});

describe("sbx streaming", () => {
  test("emits stdout chunks during execution", async () => {
    // We use Date.now() to ensure uniqueness across test runs since IDs are seeded.
    const uniqueSuffix = Date.now().toString(16);
    const intentId = `it_stream_${uniqueSuffix}_${generateId("it")}`;
    await insertIntent(lc.pool, intentId, {
      goal: "streaming test",
      inputs: {},
      constraints: {},
      connectors: []
    });

    daemon.pushResponse({
      info: {
        id: "msg-plan-ok",
        structured_output: {
          goal: "streaming test",
          design: ["design"],
          files: ["file.ts"],
          risks: ["none"],
          tests: []
        }
      },
      usage: { total_tokens: 123 }
    });

    daemon.pushResponse({
      info: {
        id: "msg-build-stream",
        structured_output: {
          patch: [],
          tests: [],
          test_command: "echo hello"
        }
      },
      usage: { total_tokens: 456 }
    });

    const { runId } = await startIntentRun(lc.pool, lc.workflow, intentId, {
      recipeName: "sandbox-default",
      queueName: "intentQ",
      queuePartitionKey: "stream-test"
    });

    await approvePlan(lc.pool, runId, "test");

    // Wait for completion
    await lc.workflow.waitUntilComplete(intentId, 15000);

    const sbxRun = await lc.pool.query("SELECT task_key FROM app.sbx_runs WHERE run_id = $1", [
      runId
    ]);
    expect(sbxRun.rows.length).toBe(1);
    const taskKey = sbxRun.rows[0].task_key;

    const { getConfig } = await import("../../src/config");
    const sysPool = new (await import("pg")).Pool({
      connectionString: getConfig().systemDatabaseUrl
    });
    try {
      const notifications = await sysPool.query(
        "SELECT message FROM dbos.notifications WHERE destination_uuid = $1 AND topic = 'stdout'",
        [taskKey]
      );

      expect(notifications.rows.length).toBeGreaterThanOrEqual(1);
      const firstChunk = JSON.parse(notifications.rows[0].message);
      expect(firstChunk.kind).toBe("stdout");
      expect(firstChunk.chunk).toContain("OK: echo hello");
      expect(firstChunk.seq).toBe(0);

      const closed = await sysPool.query(
        "SELECT message FROM dbos.notifications WHERE destination_uuid = $1 AND topic = 'stream_closed'",
        [taskKey]
      );
      expect(closed.rows.length).toBeGreaterThanOrEqual(1);
      const closePayload = JSON.parse(closed.rows[0].message);
      expect(closePayload.seq).toBeGreaterThanOrEqual(1);

      // Check status events
      const statusEvents = await sysPool.query(
        "SELECT message FROM dbos.notifications WHERE destination_uuid = $1 AND topic = 'status' ORDER BY created_at_epoch_ms ASC",
        [intentId]
      );
      expect(statusEvents.rows.length).toBeGreaterThanOrEqual(2);
      const statuses = statusEvents.rows.map((r) => JSON.parse(r.message).status);
      expect(statuses).toContain("running");
      expect(statuses).toContain("succeeded");
    } finally {
      await sysPool.end();
    }
  });
});
