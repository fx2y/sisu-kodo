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

describe("OC Retry Cache", () => {
  let daemon: OCMockDaemon;
  const daemonPort = 4100;
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
    const intentId = generateId("it_cache");
    await insertIntent(pool, intentId, { goal: "cache test", inputs: {}, constraints: {} });
    const { runId } = await startIntentRun(pool, workflow, intentId, {});
    return runId;
  }

  it("should return cached response for same opKey", async () => {
    const cfg = getConfig();
    const wrapper = new OCWrapper(cfg);
    const runId = await createTestRun();
    const sid = await wrapper.createSession(runId, runId);

    const prompt = "echo hello";
    const schema = { type: "object" };
    const opts = { runId, stepId: "DecideST", attempt: 1 };

    const initialCallCount = daemon.callCount;
    const res1 = await wrapper.promptStructured(sid, prompt, schema, opts);
    expect(daemon.callCount).toBe(initialCallCount + 1);

    const res2 = await wrapper.promptStructured(sid, prompt, schema, opts);
    // Should NOT call daemon again
    expect(daemon.callCount).toBe(initialCallCount + 1);
    expect(res2).toEqual(res1);
  });

  it("should NOT return cached response if force=true", async () => {
    const cfg = getConfig();
    const wrapper = new OCWrapper(cfg);
    const runId = await createTestRun();
    const sid = await wrapper.createSession(runId, runId);

    const prompt = "echo hello";
    const schema = { type: "object" };
    const opts = { runId, stepId: "DecideST", attempt: 1 };

    const initialCallCount = daemon.callCount;
    await wrapper.promptStructured(sid, prompt, schema, opts);
    expect(daemon.callCount).toBe(initialCallCount + 1);

    await wrapper.promptStructured(sid, prompt, schema, { ...opts, force: true });
    // Should call daemon again
    expect(daemon.callCount).toBe(initialCallCount + 2);
  });

  it("should NOT return cached response if attempt changes", async () => {
    const cfg = getConfig();
    const wrapper = new OCWrapper(cfg);
    const runId = await createTestRun();
    const sid = await wrapper.createSession(runId, runId);

    const prompt = "echo hello";
    const schema = { type: "object" };

    const initialCallCount = daemon.callCount;
    await wrapper.promptStructured(sid, prompt, schema, { runId, stepId: "DecideST", attempt: 1 });
    expect(daemon.callCount).toBe(initialCallCount + 1);

    await wrapper.promptStructured(sid, prompt, schema, { runId, stepId: "DecideST", attempt: 2 });
    // Should call daemon again
    expect(daemon.callCount).toBe(initialCallCount + 2);
  });
});
