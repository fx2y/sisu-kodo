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

describe("intent queue deduplication", () => {
  test("same deduplicationID rejects second enqueue while first is pending/running", async () => {
    const dedupId = generateId("dedup");
    const intentId1 = generateId("it1");
    const intentId2 = generateId("it2");

    await insertIntent(lc.pool, intentId1, { goal: "sleep 5", inputs: {}, constraints: {} });
    await insertIntent(lc.pool, intentId2, { goal: "goal 2", inputs: {}, constraints: {} });

    const res1 = await startIntentRun(lc.pool, lc.workflow, intentId1, {
      deduplicationID: dedupId,
      queuePartitionKey: "test-partition"
    });
    await approvePlan(lc.pool, res1.runId, "test");
    expect(res1.workflowId).toBe(intentId1);

    await expect(
      startIntentRun(lc.pool, lc.workflow, intentId2, {
        deduplicationID: dedupId,
        queuePartitionKey: "test-partition"
      })
    ).rejects.toThrow();

    await lc.workflow.waitUntilComplete(intentId1, 15000);

    const handle = DBOS.retrieveWorkflow(intentId1);
    const status = await handle.getStatus();
    expect(status?.status).toBe("SUCCESS");

    const runs = await lc.pool.query(
      "SELECT intent_id, status FROM app.runs WHERE intent_id IN ($1, $2) ORDER BY intent_id",
      [intentId1, intentId2]
    );
    expect(runs.rowCount).toBe(2);
    const first = runs.rows.find((row) => row.intent_id === intentId1);
    const second = runs.rows.find((row) => row.intent_id === intentId2);
    expect(first?.status).toBe("succeeded");
    expect(second?.status).toBe("failed");
  });
});
