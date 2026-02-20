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

describe("step counters and duplicate receipts", () => {
  test("same workflow start converges with attempt=1 and no duplicate receipts", async () => {
    const intentId = generateId("it_counter");
    await insertIntent(lc.pool, intentId, {
      goal: "sleep 1",
      inputs: {},
      constraints: {}
    });

    const first = await startIntentRun(lc.pool, lc.workflow, intentId, {
      queuePartitionKey: "test-partition"
    });
    const second = await startIntentRun(lc.pool, lc.workflow, intentId, {
      queuePartitionKey: "test-partition"
    });
    await approvePlan(lc.pool, first.runId, "test");
    expect(second.runId).toBe(first.runId);
    expect(second.workflowId).toBe(intentId);

    await lc.workflow.waitUntilComplete(intentId, 10000);

    const attempts = await lc.pool.query<{ step_id: string; attempt: number | null }>(
      `SELECT step_id, (output ->> 'attempt')::INT AS attempt
       FROM app.run_steps
       WHERE run_id = $1
       ORDER BY step_id`,
      [first.runId]
    );

    const byStep = new Map(attempts.rows.map((row) => [row.step_id, row.attempt]));
    expect(byStep.get("CompileST")).toBe(1);
    expect(byStep.get("ApplyPatchST")).toBe(1);
    expect(byStep.get("DecideST")).toBe(1);
    expect(byStep.get("ExecuteST")).toBe(1);

    const receipt = await lc.pool.query<{ seen_count: number }>(
      "SELECT seen_count FROM app.mock_receipts WHERE run_id = $1 AND step_id = 'ExecuteST'",
      [first.runId]
    );
    expect(receipt.rowCount).toBe(1);
    expect(receipt.rows[0]?.seen_count).toBe(1);
  });
});
