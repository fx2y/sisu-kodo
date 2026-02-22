import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { IntentSteps } from "../../src/workflow/dbos/intentSteps";
import { insertIntent } from "../../src/db/intentRepo";
import { startIntentRun } from "../../src/workflow/start-intent";
import { approvePlan } from "../../src/db/planApprovalRepo";
import { generateId } from "../../src/lib/id";
import { setRngSeed } from "../../src/lib/rng";
import { OCMockDaemon } from "../oc-mock-daemon";
import { setupLifecycle, teardownLifecycle, type TestLifecycle } from "./lifecycle";

let lc: TestLifecycle;
let daemon: OCMockDaemon;
const daemonPort = 4398;

beforeAll(async () => {
  setRngSeed(0x54f50000 + Number(process.env.PORT ?? 0));
  process.env.OC_BASE_URL = `http://127.0.0.1:${daemonPort}`;
  process.env.OC_MODE = "live";
  process.env.INTENT_QUEUE_WORKER_CONCURRENCY = "1";
  process.env.INTENT_QUEUE_CONCURRENCY = "1";
  process.env.CHAOS_SLEEP_EXECUTE = "700";
  daemon = new OCMockDaemon(daemonPort);
  await daemon.start();
  IntentSteps.resetImpl();
  lc = await setupLifecycle(20);
  await lc.pool.query("ALTER TABLE app.runs ADD COLUMN IF NOT EXISTS budget JSONB");
});

afterAll(async () => {
  await teardownLifecycle(lc);
  await daemon.stop();
  await IntentSteps.teardown();
});

describe("CY4 priority under backlog", () => {
  test("interactive intentQ lane starts before queued batch backlog entries", async () => {
    const allIntentIds: string[] = [];
    const batchIntentIds: string[] = [];

    const enqueueRun = async (lane: "batch" | "interactive", suffix: string) => {
      const intentId = generateId(`it_${lane}_${suffix}`);
      allIntentIds.push(intentId);
      if (lane === "batch") batchIntentIds.push(intentId);
      await insertIntent(lc.pool, intentId, {
        goal: `${lane}-${suffix}`,
        inputs: {},
        constraints: {}
      });
      daemon.pushAgentResponse("plan", {
        info: {
          id: `plan-${lane}-${suffix}`,
          structured_output: {
            goal: `${lane}-${suffix}`,
            design: ["d"],
            files: ["f.ts"],
            risks: ["r"],
            tests: ["one.test.ts"]
          },
          tool_calls: []
        },
        messages: [{ type: "text", text: "ok" }],
        usage: { total_tokens: 1 }
      });
      daemon.pushAgentResponse("build", {
        info: {
          id: `build-${lane}-${suffix}`,
          structured_output: {
            patch: [],
            tests: ["one.test.ts"],
            test_command: "echo ok"
          },
          tool_calls: []
        },
        messages: [{ type: "text", text: "ok" }],
        usage: { total_tokens: 1 }
      });
      const { runId } = await startIntentRun(lc.pool, lc.workflow, intentId, {
        recipeName: "sandbox-default",
        queueName: "intentQ",
        lane,
        queuePartitionKey: "tenant-pri-shared",
        workload: { concurrency: 1, steps: 1, sandboxMinutes: 1 }
      });
      await approvePlan(lc.pool, runId, "test");
      return { runId, intentId };
    };

    await enqueueRun("batch", "1");
    await enqueueRun("batch", "2");
    await enqueueRun("batch", "3");
    const interactive = await enqueueRun("interactive", "x");

    await Promise.all(allIntentIds.map((id) => lc.workflow.waitUntilComplete(id, 60000).catch(() => null)));

    const rows = await lc.sysPool.query(
      `SELECT workflow_uuid, queue_name, started_at_epoch_ms
         FROM dbos.workflow_status
        WHERE workflow_uuid = ANY($1::text[])
        ORDER BY started_at_epoch_ms ASC`,
      [allIntentIds]
    );
    const intentRows = rows.rows.filter((r) => r.queue_name === "intentQ");
    expect(intentRows.length).toBe(allIntentIds.length);

    const startedById = new Map<string, number>(
      intentRows.map((r) => [String(r.workflow_uuid), Number(r.started_at_epoch_ms)])
    );
    const interactiveStart = startedById.get(interactive.intentId);
    expect(interactiveStart).toBeTypeOf("number");

    const laterBatchStarts = batchIntentIds
      .map((id) => startedById.get(id))
      .filter((n): n is number => typeof n === "number" && n > (interactiveStart as number));
    expect(laterBatchStarts.length).toBeGreaterThan(0);

    const runStates = await lc.pool.query(
      "SELECT workflow_id, status FROM app.runs WHERE workflow_id = ANY($1::text[])",
      [allIntentIds]
    );
    const interactiveRun = runStates.rows.find((r) => r.workflow_id === interactive.intentId);
    expect(interactiveRun?.status).toBe("succeeded");
  }, 30000);
});
