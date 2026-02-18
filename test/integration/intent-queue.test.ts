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
  test("same deduplicationID rejects second enqueue while first is pending/running", async () => {
    const dedupId = generateId("dedup");
    const intentId1 = generateId("it1");
    const intentId2 = generateId("it2");

    await insertIntent(pool, intentId1, { goal: "sleep 5", inputs: {}, constraints: {} });
    await insertIntent(pool, intentId2, { goal: "goal 2", inputs: {}, constraints: {} });

    const res1 = await startIntentRun(pool, workflow, intentId1, {
      deduplicationID: dedupId
    });
    expect(res1.workflowId).toBe(intentId1);

    await expect(
      startIntentRun(pool, workflow, intentId2, {
        deduplicationID: dedupId
      })
    ).rejects.toThrow();

    await workflow.waitUntilComplete(intentId1, 15000);

    const handle = DBOS.retrieveWorkflow(intentId1);
    const status = await handle.getStatus();
    expect(status?.status).toBe("SUCCESS");

    const runs = await pool.query(
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
