import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { OCMockDaemon } from "../oc-mock-daemon";
import { OCWrapper } from "../../src/oc/wrapper";
import { getConfig } from "../../src/config";
import { createPool, closePool } from "../../src/db/pool";
import type { Pool } from "pg";
import { generateId } from "../../src/lib/id";
import { insertIntent } from "../../src/db/intentRepo";
import { startIntentRun } from "../../src/workflow/start-intent";
import { DBOSWorkflowEngine } from "../../src/workflow/engine-dbos";
import { DBOS } from "@dbos-inc/dbos-sdk";

describe("OC Wrapper Retry Safe", () => {
  let daemon: OCMockDaemon;
  const daemonPort = 4101;
  const ocUrl = `http://127.0.0.1:${daemonPort}`;
  let pool: Pool;
  let workflow: DBOSWorkflowEngine;

  beforeAll(async () => {
    await DBOS.launch();
    pool = createPool();
    workflow = new DBOSWorkflowEngine(20);
    daemon = new OCMockDaemon(daemonPort);
    await daemon.start();
    process.env.OC_MODE = "live";
    process.env.OC_BASE_URL = ocUrl;
  });

  afterAll(async () => {
    await daemon.stop();
    await DBOS.shutdown();
    await pool.end();
    await closePool();
  });

  async function createTestRun() {
    const intentId = generateId("it_retrysafe");
    await insertIntent(pool, intentId, { goal: "retrysafe test", inputs: {}, constraints: {} });
    const { runId } = await startIntentRun(pool, workflow, intentId, {});
    return runId;
  }

  it("should reuse cached result on retry of the same step attempt", async () => {
    const cfg = getConfig();
    const wrapper = new OCWrapper(cfg);
    const runId = await createTestRun();
    const sid = await wrapper.createSession(runId, runId);

    const opts = { runId, stepId: "DecideST", attempt: 1 };

    const initialCalls = daemon.callCount;
    const res1 = await wrapper.promptStructured(sid, "p", {}, opts);
    expect(daemon.callCount).toBe(initialCalls + 1);

    // Simulate retry within same process (cache hit)
    const res2 = await wrapper.promptStructured(sid, "p", {}, opts);
    expect(daemon.callCount).toBe(initialCalls + 1);
    expect(res2).toEqual(res1);
  });
});
