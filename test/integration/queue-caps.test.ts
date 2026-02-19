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

describe("queue classes and recipe caps", () => {
  test("rejects workloads above recipe caps before enqueue/write", async () => {
    const intentId = generateId("it_caps_bad");
    await insertIntent(pool, intentId, {
      goal: "caps bad",
      inputs: {},
      constraints: {}
    });

    await expect(
      startIntentRun(pool, workflow, intentId, {
        recipeName: "sandbox-default",
        workload: {
          concurrency: 21,
          steps: 1,
          sandboxMinutes: 1
        }
      })
    ).rejects.toThrow(/recipe cap exceeded/);

    const res = await pool.query("SELECT COUNT(*)::text AS c FROM app.runs WHERE intent_id = $1", [
      intentId
    ]);
    expect(Number(res.rows[0].c)).toBe(0);
  });

  test("accepts workloads within recipe caps", async () => {
    const intentId = generateId("it_caps_ok");
    await insertIntent(pool, intentId, {
      goal: "caps ok",
      inputs: {},
      constraints: {}
    });

    const { runId, workflowId } = await startIntentRun(pool, workflow, intentId, {
      recipeName: "sandbox-default",
      queueName: "sbxQ",
      queuePartitionKey: "test-partition",
      workload: {
        concurrency: 5,
        steps: 10,
        sandboxMinutes: 2
      }
    });
    await approvePlan(pool, runId, "test");

    expect(workflowId).toBe(intentId);
    expect(runId).toMatch(/^run_/);

    await workflow.waitUntilComplete(intentId, 10000);
    const run = await pool.query("SELECT status FROM app.runs WHERE id = $1", [runId]);
    expect(run.rows[0]?.status).toBe("succeeded");
  });
});
