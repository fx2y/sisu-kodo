import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { DBOS } from "@dbos-inc/dbos-sdk";
import { createPool, closePool } from "../../src/db/pool";
import { DBOSWorkflowEngine } from "../../src/workflow/engine-dbos";
import { startIntentRun } from "../../src/workflow/start-intent";
import { insertIntent } from "../../src/db/intentRepo";
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

describe("intent queue deduplication", () => {
  test("same deduplicationID -> same workflow execution even with different intentIds", async () => {
    const dedupId = generateId("dedup");
    const intentId1 = generateId("it1");
    const intentId2 = generateId("it2");

    await insertIntent(pool, intentId1, { goal: "goal 1", inputs: {}, constraints: {} });
    await insertIntent(pool, intentId2, { goal: "goal 2", inputs: {}, constraints: {} });

    // Enqueue first
    const res1 = await startIntentRun(pool, workflow, intentId1, {
      deduplicationID: dedupId
    });
    expect(res1.workflowId).toBe(dedupId);

    // Enqueue second with SAME dedupId but DIFFERENT intentId
    const res2 = await startIntentRun(pool, workflow, intentId2, {
      deduplicationID: dedupId
    });
    expect(res2.workflowId).toBe(dedupId);

    // Wait for completion
    await workflow.waitUntilComplete(dedupId, 10000);

    // Verify DBOS status
    const handle = DBOS.retrieveWorkflow(dedupId);
    const status = await handle.getStatus();
    expect(status?.status).toBe("SUCCESS");

    // Check that ONLY the first intent goal was executed (because it was deduplicated)
    // Actually, DBOS returns the EXISTING handle.
    // In our implementation, LoadStepImpl uses workflowId to find the run.
    // Since workflow_id is unique, both runs in app.runs might have SAME workflow_id?
    // Wait! app.runs.workflow_id has UNIQUE constraint.
    // So 'insertRun' with SAME workflow_id (dedupId) will CONFLICT and update the existing row.

    const runs = await pool.query("SELECT intent_id FROM app.runs WHERE workflow_id = $1", [
      dedupId
    ]);
    expect(runs.rowCount).toBe(1);
    // The first one was inserted. The second one updated the row.
    // Since we used ON CONFLICT (workflow_id) DO UPDATE SET workflow_id = EXCLUDED.workflow_id
    // it didn't change intent_id!
    expect(runs.rows[0].intent_id).toBe(intentId1);
  });
});
