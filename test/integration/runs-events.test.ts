import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { DBOS } from "@dbos-inc/dbos-sdk";
import { createPool, closePool } from "../../src/db/pool";
import { DBOSWorkflowEngine } from "../../src/workflow/engine-dbos";
import { startIntentRun } from "../../src/workflow/start-intent";
import { insertIntent } from "../../src/db/intentRepo";
import { findRunById } from "../../src/db/runRepo";
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

describe("HITL events integration", () => {
  test("workflow transitions to waiting_input and resumes on event", async () => {
    const intentId = generateId("it_ask");
    await insertIntent(pool, intentId, {
      goal: "ask me something",
      inputs: {},
      constraints: {}
    });

    const { runId } = await startIntentRun(pool, workflow, intentId, {
      queuePartitionKey: "test-partition"
    });
    await approvePlan(pool, runId, "test");

    // Wait for it to reach waiting_input
    let run = await findRunById(pool, runId);
    for (let i = 0; i < 20; i++) {
      if (run?.status === "waiting_input") break;
      await new Promise((r) => setTimeout(r, 500));
      run = await findRunById(pool, runId);
    }
    expect(run?.status).toBe("waiting_input");

    // Send event
    await workflow.sendEvent(intentId, { type: "answer", payload: { text: "42" } });

    // Wait for completion
    await workflow.waitUntilComplete(intentId, 20000);

    run = await findRunById(pool, runId);
    expect(run?.status).toBe("succeeded");
  }, 30000);
});
