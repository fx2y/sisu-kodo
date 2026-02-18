import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { DBOS } from "@dbos-inc/dbos-sdk";
import { createPool, closePool } from "../../src/db/pool";
import { DBOSWorkflowEngine } from "../../src/workflow/engine-dbos";
import { startIntentRun } from "../../src/workflow/start-intent";
import { insertIntent } from "../../src/db/intentRepo";
import { approvePlan } from "../../src/db/planApprovalRepo";
import { generateId } from "../../src/lib/id";
import type { Pool } from "pg";

let pool: Pool;
let workflow: DBOSWorkflowEngine;

beforeAll(async () => {
  await DBOS.launch();
  pool = createPool();
  workflow = new DBOSWorkflowEngine(20);
});

afterAll(async () => {
  await DBOS.shutdown();
  await pool.end();
  await closePool();
});

describe("intent workflow idempotency (exactly-once)", () => {
  test("10x parallel starts for same intentId -> one execution", async () => {
    const intentId = generateId("it_idem");
    await insertIntent(pool, intentId, {
      goal: "idempotency test",
      inputs: {},
      constraints: {}
    });

    // Fire 10 concurrent requests
    const starts = Array.from({ length: 10 }).map(() =>
      startIntentRun(pool, workflow, intentId, { traceId: "test-trace" })
    );

    const results = await Promise.all(starts);
    await approvePlan(pool, results[0].runId, "test");

    // All should return the same workflowId (which equals intentId)
    for (const res of results) {
      expect(res.workflowId).toBe(intentId);
    }

    // Wait for completion
    await workflow.waitUntilComplete(intentId, 10000);

    // Verify DBOS workflow status is SUCCESS
    const handle = DBOS.retrieveWorkflow(intentId);
    const status = await handle.getStatus();
    expect(status?.status).toBe("SUCCESS");

    // Check run rows in DB: we should have 1 run row (exactly-once)
    const res = await pool.query("SELECT id, status FROM app.runs WHERE workflow_id = $1", [
      intentId
    ]);
    expect(res.rowCount).toBe(1);
    // At least one (the first that finished) should be 'succeeded' or 'queued' depending on timing of startWorkflow
    // Actually, DBOS.startWorkflow returns the handle even if already running.
    // Our 'startIntentRun' updates run status based on trigger success.
  });
});
