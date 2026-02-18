import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { DBOS } from "@dbos-inc/dbos-sdk";
import type { Pool } from "pg";
import { createPool, closePool } from "../../src/db/pool";
import { DBOSWorkflowEngine } from "../../src/workflow/engine-dbos";
import { insertIntent } from "../../src/db/intentRepo";
import { startIntentRun } from "../../src/workflow/start-intent";
import { approvePlan } from "../../src/db/planApprovalRepo";
import { generateId } from "../../src/lib/id";

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

describe("step counters and duplicate receipts", () => {
  test("same workflow start converges with attempt=1 and no duplicate receipts", async () => {
    const intentId = generateId("it_counter");
    await insertIntent(pool, intentId, {
      goal: "sleep 1",
      inputs: {},
      constraints: {}
    });

    const first = await startIntentRun(pool, workflow, intentId, {});
    const second = await startIntentRun(pool, workflow, intentId, {});
    await approvePlan(pool, first.runId, "test");
    expect(second.runId).toBe(first.runId);
    expect(second.workflowId).toBe(intentId);

    await workflow.waitUntilComplete(intentId, 10000);

    const attempts = await pool.query<{ step_id: string; attempt: number | null }>(
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

    const receipt = await pool.query<{ seen_count: number }>(
      "SELECT seen_count FROM app.mock_receipts WHERE run_id = $1 AND step_id = 'ExecuteST'",
      [first.runId]
    );
    expect(receipt.rowCount).toBe(1);
    expect(receipt.rows[0]?.seen_count).toBe(1);
  });
});
