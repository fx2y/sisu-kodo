import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createPool, closePool } from "../../src/db/pool";
import type { Pool } from "pg";
import { findOpencodeCallsByRunId } from "../../src/db/opencodeCallRepo";
import { generateId } from "../../src/lib/id";
import { insertIntent } from "../../src/db/intentRepo";
import { startIntentRun } from "../../src/workflow/start-intent";
import { DBOSWorkflowEngine } from "../../src/workflow/engine-dbos";
import { DBOS } from "@dbos-inc/dbos-sdk";

let pool: Pool;
let workflow: DBOSWorkflowEngine;

beforeAll(async () => {
  await DBOS.launch();
  pool = createPool();
  workflow = new DBOSWorkflowEngine(20);
  process.env.OC_MODE = "live"; // Force logic path
});

afterAll(async () => {
  await DBOS.shutdown();
  await pool.end();
  await closePool();
});

describe("OC Wrapper Replay Proof", () => {
  it("should reconstruct prompt, schema, and output from DB rows", async () => {
    const intentId = generateId("it_replay");
    await insertIntent(pool, intentId, { goal: "replay proof", inputs: {}, constraints: {} });
    
    const { runId } = await startIntentRun(pool, workflow, intentId, {});
    await workflow.waitUntilComplete(intentId, 10000);

    const calls = await findOpencodeCallsByRunId(pool, runId);
    const decideCall = calls.find(c => c.step_id === "DecideST");
    
    expect(decideCall).toBeDefined();
    expect(decideCall?.op_key).toBeDefined();
    expect(decideCall?.request).toBeDefined();
    expect(decideCall?.response).toBeDefined();
    // In our implementation, prompt and schema_hash are also stored
    expect(decideCall?.prompt).toContain("Execute goal: replay proof");
  });
});
