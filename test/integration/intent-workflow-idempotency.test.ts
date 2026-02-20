import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { DBOS } from "@dbos-inc/dbos-sdk";
import { startIntentRun } from "../../src/workflow/start-intent";
import { insertIntent } from "../../src/db/intentRepo";
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

describe("intent workflow idempotency (exactly-once)", () => {
  test("10x parallel starts for same intentId -> one execution", async () => {
    const intentId = generateId("it_idem");
    await insertIntent(lc.pool, intentId, {
      goal: "idempotency test",
      inputs: {},
      constraints: {}
    });

    // Fire 10 concurrent requests
    const starts = Array.from({ length: 10 }).map(() =>
      startIntentRun(lc.pool, lc.workflow, intentId, {
        traceId: "test-trace",
        queuePartitionKey: "test-partition"
      })
    );

    const results = await Promise.all(starts);
    await approvePlan(lc.pool, results[0].runId, "test");

    // All should return the same workflowId (which equals intentId)
    for (const res of results) {
      expect(res.workflowId).toBe(intentId);
    }

    // Wait for completion
    await lc.workflow.waitUntilComplete(intentId, 20000);

    // Verify DBOS workflow status is SUCCESS
    const handle = DBOS.retrieveWorkflow(intentId);
    const status = await handle.getStatus();
    expect(status?.status).toBe("SUCCESS");

    // Check run rows in DB: we should have 1 run row (exactly-once)
    const res = await lc.pool.query("SELECT id, status FROM app.runs WHERE workflow_id = $1", [
      intentId
    ]);
    expect(res.rowCount).toBe(1);
    // At least one (the first that finished) should be 'succeeded' or 'queued' depending on timing of startWorkflow
    // Actually, DBOS.startWorkflow returns the handle even if already running.
    // Our 'startIntentRun' updates run status based on trigger success.
  });
});
