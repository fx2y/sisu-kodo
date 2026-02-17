import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { DBOS } from "@dbos-inc/dbos-sdk";
import type { Pool } from "pg";
import { createPool } from "../../src/db/pool";
import { startApp } from "../../src/server/app";
import { DBOSWorkflowEngine } from "../../src/workflow/engine-dbos";

let pool: Pool;
let stop: (() => Promise<void>) | undefined;

beforeAll(async () => {
  await DBOS.launch();
  pool = createPool();

  // Clean app schema for deterministic repeated runs
  await pool.query("TRUNCATE app.intents, app.runs, app.run_steps, app.artifacts CASCADE");

  const workflow = new DBOSWorkflowEngine(25);
  const app = await startApp(pool, workflow);
  stop = async () => {
    await new Promise<void>((resolve) => app.server.close(() => resolve()));
    await DBOS.shutdown();
  };
});

afterAll(async () => {
  if (stop) await stop();
  await pool.end();
});

describe("intents validation e2e", () => {
  const baseUrl = `http://127.0.0.1:${process.env.PORT ?? "3001"}`;

  test("POST /intents - valid payload", async () => {
    const res = await fetch(`${baseUrl}/intents`, {
      method: "POST",
      body: JSON.stringify({
        goal: "test goal",
        inputs: { foo: "bar" },
        constraints: { baz: 1 }
      }),
      headers: { "content-type": "application/json" }
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.intentId).toMatch(/^it_[0-9a-f]+/);
  });

  test("POST /intents - invalid payload (missing goal)", async () => {
    const res = await fetch(`${baseUrl}/intents`, {
      method: "POST",
      body: JSON.stringify({
        inputs: {},
        constraints: {}
      }),
      headers: { "content-type": "application/json" }
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Intent");
    expect(body.details).toBeDefined();
  });

  test("POST /intents/:id/run - flow and GET /runs/:id", async () => {
    // 1. Create intent
    const intentRes = await fetch(`${baseUrl}/intents`, {
      method: "POST",
      body: JSON.stringify({
        goal: "run goal",
        inputs: {},
        constraints: {}
      }),
      headers: { "content-type": "application/json" }
    });
    const { intentId } = await intentRes.json();

    // 2. Run intent
    const runRes = await fetch(`${baseUrl}/intents/${intentId}/run`, {
      method: "POST",
      body: JSON.stringify({ traceId: "t1" }),
      headers: { "content-type": "application/json" }
    });
    expect(runRes.status).toBe(202);
    const { runId } = await runRes.json();

    // 3. Poll for run completion (or just check existence)
    let finalRun: Record<string, unknown> = {};
    for (let i = 0; i < 20; i++) {
      const getRes = await fetch(`${baseUrl}/runs/${runId}`);
      finalRun = (await getRes.json()) as Record<string, unknown>;
      if (finalRun.status === "succeeded") break;
      await new Promise((r) => setTimeout(r, 100));
    }

    expect(finalRun.runId).toBe(runId);
    expect(finalRun.status).toBe("succeeded");
    const steps = finalRun.steps as Record<string, unknown>[];
    expect(steps.length).toBeGreaterThan(0);
    expect(steps[0].phase).toBe("planning");
  });

  test("GET /runs/:id - not found", async () => {
    const res = await fetch(`${baseUrl}/runs/run_missing`);
    expect(res.status).toBe(404);
  });
});
