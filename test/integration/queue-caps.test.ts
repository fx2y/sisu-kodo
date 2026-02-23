import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { insertIntent } from "../../src/db/intentRepo";
import { startIntentRun } from "../../src/workflow/start-intent";
import { approvePlan } from "../../src/db/planApprovalRepo";
import { generateId } from "../../src/lib/id";
import { setupLifecycle, teardownLifecycle, type TestLifecycle } from "./lifecycle";

let lc: TestLifecycle;

beforeAll(async () => {
  lc = await setupLifecycle(20);
});

afterAll(async () => {
  await teardownLifecycle(lc);
});

describe("queue classes and recipe caps", () => {
  test("rejects workloads above recipe caps before enqueue/write", async () => {
    const intentId = generateId("it_caps_bad");
    await insertIntent(lc.pool, intentId, {
      goal: "caps bad",
      inputs: {},
      constraints: {}
    });

    await expect(
      startIntentRun(lc.pool, lc.workflow, intentId, {
        recipeName: "sandbox-default",
        workload: {
          concurrency: 21,
          steps: 1,
          sandboxMinutes: 1
        }
      })
    ).rejects.toThrow(/recipe cap exceeded/);

    const res = await lc.pool.query(
      "SELECT COUNT(*)::text AS c FROM app.runs WHERE intent_id = $1",
      [intentId]
    );
    expect(Number(res.rows[0].c)).toBe(0);
  });

  test("accepts workloads within recipe caps", { timeout: 30000 }, async () => {
    const intentId = generateId("it_caps_ok");
    await insertIntent(lc.pool, intentId, {
      goal: "caps ok",
      inputs: {},
      constraints: {}
    });

    const { runId, workflowId } = await startIntentRun(lc.pool, lc.workflow, intentId, {
      recipeName: "sandbox-default",
      queueName: "intentQ",
      queuePartitionKey: "test-partition",
      workload: {
        concurrency: 5,
        steps: 10,
        sandboxMinutes: 2
      }
    });
    await approvePlan(lc.pool, runId, "test");

    expect(workflowId).toBe(intentId);
    expect(runId).toMatch(/^run_/);

    await lc.workflow.waitUntilComplete(intentId, 10000);
    const run = await lc.pool.query("SELECT status FROM app.runs WHERE id = $1", [runId]);
    expect(run.rows[0]?.status).toBe("succeeded");
  });
});
