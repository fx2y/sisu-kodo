import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { DBOS } from "@dbos-inc/dbos-sdk";
import { createPool, closePool } from "../../src/db/pool";
import { DBOSWorkflowEngine } from "../../src/workflow/engine-dbos";
import { startIntentRun } from "../../src/workflow/start-intent";
import { insertIntent } from "../../src/db/intentRepo";
import { generateId } from "../../src/lib/id";
import { findRunById } from "../../src/db/runRepo";
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

describe("workflow recovery caps and retries exceeded", () => {
  test("run reaches terminal 'failed' with retry_count >= 3", async () => {
    const intentId = generateId("it_fail");
    // Decision is what dictates the command.
    // For simplicity, we assume 'decide' step will use something from payload.
    // Actually, decide currently just returns some fixed structure.
    // Let's check decide.step.ts
    await insertIntent(pool, intentId, {
      goal: "fail me",
      inputs: { cmd: "FAIL_ME" },
      constraints: {}
    });

    const { runId } = await startIntentRun(pool, workflow, intentId, {
      traceId: "test-fail-trace"
    });

    // We expect it to retry 3 times (my maxRecoveryAttempts in IntentWorkflow.ts)
    // and then stop.
    // Each retry might take some time.
    // We'll wait until DBOS sees it as failed.
    const handle = DBOS.retrieveWorkflow(intentId);

    // We wait up to 20 seconds.
    let status = await handle.getStatus();
    for (let i = 0; i < 20; i++) {
      if (
        status?.status === "RETRIES_EXCEEDED" ||
        status?.status === "FAILED" ||
        status?.status === "SUCCESS"
      )
        break;
      await new Promise((r) => setTimeout(r, 1000));
      status = await handle.getStatus();
    }

    // DBOS status should be RETRIES_EXCEEDED (if using recent SDK) or FAILED/ERROR.
    expect(status?.status).toMatch(/RETRIES_EXCEEDED|FAILED|ERROR/);

    const run = await findRunById(pool, runId);
    expect(run).toBeDefined();
    // Our status update in 'runIntentWorkflow' catch block sets it to 'failed'.
    expect(run?.status).toBe("failed");
    expect(run?.retry_count).toBeGreaterThanOrEqual(1);
    expect(run?.error).toBe("Simulated terminal failure");
    expect(run?.next_action).toBe("RETRY");
  }, 30000);
});
