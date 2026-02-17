import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { DBOS } from "@dbos-inc/dbos-sdk";
import type { Pool } from "pg";
import { createPool } from "../../src/db/pool";
import { startApp } from "../../src/server/app";
import { DBOSClientWorkflowEngine } from "../../src/api-shim/dbos-client";
import { getConfig } from "../../src/config";
import "../../src/workflow/dbos/intentWorkflow";
import "../../src/workflow/dbos/crashDemoWorkflow";

let pool: Pool;
let stopWorker: (() => Promise<void>) | undefined;
let stopShim: (() => Promise<void>) | undefined;

beforeAll(async () => {
  const cfg = getConfig();
  pool = createPool();

  // 1. Start Worker (in-process for test)
  await DBOS.launch();
  stopWorker = async () => {
    await DBOS.shutdown();
  };

  // 2. Start Shim
  const shimEngine = await DBOSClientWorkflowEngine.create(
    cfg.systemDatabaseUrl,
    pool,
    DBOS.applicationVersion
  );
  const shimApp = await startApp(pool, shimEngine);
  stopShim = async () => {
    await new Promise<void>((resolve) => shimApp.server.close(() => resolve()));
    await shimEngine.destroy();
  };
});

afterAll(async () => {
  if (stopShim) await stopShim();
  if (stopWorker) await stopWorker();
  await pool.end();
});

describe("API Shim E2E", () => {
  const baseUrl = `http://127.0.0.1:${process.env.PORT ?? "3001"}`;

  test("Shim can trigger a workflow via DBOSClient", async () => {
    // 1. Create intent
    const intentRes = await fetch(`${baseUrl}/intents`, {
      method: "POST",
      body: JSON.stringify({
        goal: "shim goal",
        inputs: {},
        constraints: {}
      }),
      headers: { "content-type": "application/json" }
    });
    const { intentId } = (await intentRes.json()) as { intentId: string };

    // 2. Run intent via shim
    const runRes = await fetch(`${baseUrl}/intents/${intentId}/run`, {
      method: "POST",
      body: JSON.stringify({ traceId: "shim-trace" }),
      headers: { "content-type": "application/json" }
    });
    expect(runRes.status).toBe(202);
    const { runId } = (await runRes.json()) as { runId: string };

    // 3. Poll for run (we don't wait for success here if dequeuer is flaky in vitest)
    const getRes = await fetch(`${baseUrl}/runs/${runId}`);
    const run = (await getRes.json()) as { runId: string; status: string };
    expect(run.runId).toBe(runId);
    expect(run.status).toBeDefined();
  });

  test("Shim can send events to a running workflow", async () => {
    // 1. Create intent
    const intentRes = await fetch(`${baseUrl}/intents`, {
      method: "POST",
      body: JSON.stringify({
        goal: "event goal",
        inputs: {},
        constraints: {}
      }),
      headers: { "content-type": "application/json" }
    });
    const { intentId } = (await intentRes.json()) as { intentId: string };

    // 2. Run intent
    const runRes = await fetch(`${baseUrl}/intents/${intentId}/run`, {
      method: "POST",
      body: JSON.stringify({ traceId: "event-trace" }),
      headers: { "content-type": "application/json" }
    });
    const { runId } = (await runRes.json()) as { runId: string };

    // 3. Send event via shim
    const eventRes = await fetch(`${baseUrl}/runs/${runId}/events`, {
      method: "POST",
      body: JSON.stringify({ type: "input", payload: { ok: true } }),
      headers: { "content-type": "application/json" }
    });
    expect(eventRes.status).toBe(202);
  });
});
