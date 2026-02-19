import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { DBOS } from "@dbos-inc/dbos-sdk";
import type { Pool } from "pg";
import { createPool, closePool } from "../../src/db/pool";
import { DBOSWorkflowEngine } from "../../src/workflow/engine-dbos";
import { insertIntent } from "../../src/db/intentRepo";
import { startIntentRun } from "../../src/workflow/start-intent";
import { findOpencodeCallsByRunId } from "../../src/db/opencodeCallRepo";
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

describe("opencode call envelope persistence", () => {
  test("persists DecideST request/response envelopes", async () => {
    const intentId = generateId("it_oc");
    await insertIntent(pool, intentId, {
      goal: "log oc call",
      inputs: {},
      constraints: {}
    });

    const { runId } = await startIntentRun(pool, workflow, intentId, {
      queuePartitionKey: "test-partition"
    });
    await approvePlan(pool, runId, "test");
    await workflow.waitUntilComplete(intentId, 10000);

    const calls = await findOpencodeCallsByRunId(pool, runId);
    expect(calls.length).toBeGreaterThan(0);

    const decide = calls.find((call) => call.step_id === "DecideST");
    expect(decide).toBeDefined();
    expect(decide?.request.prompt).toContain("Goal: log oc call");
    expect(decide?.response.prompt).toContain("Goal: log oc call");
  });
});
