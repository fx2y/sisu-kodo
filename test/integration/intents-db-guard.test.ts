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
}, 120_000);

describe("intents-db-guard integration", () => {
  const baseUrl = `http://127.0.0.1:${process.env.PORT ?? "3001"}`;

  test("does not insert intent into DB on validation failure", async () => {
    // Count intents before
    const beforeRes = await pool.query("SELECT COUNT(*) as c FROM app.intents");
    const countBefore = Number(beforeRes.rows[0].c);

    // POST invalid intent
    const res = await fetch(`${baseUrl}/intents`, {
      method: "POST",
      body: JSON.stringify({
        // missing goal
        inputs: {},
        constraints: {}
      }),
      headers: { "content-type": "application/json" }
    });
    expect(res.status).toBe(400);

    // Count intents after
    const afterRes = await pool.query("SELECT COUNT(*) as c FROM app.intents");
    const countAfter = Number(afterRes.rows[0].c);

    expect(countAfter).toBe(countBefore);
  });

  test("does not insert run into DB on validation failure", async () => {
    // 1. Create intent
    const intentRes = await fetch(`${baseUrl}/intents`, {
      method: "POST",
      body: JSON.stringify({ goal: "valid", inputs: {}, constraints: {} }),
      headers: { "content-type": "application/json" }
    });
    expect(intentRes.status).toBe(201);
    const { intentId } = await intentRes.json();

    // 2. Count runs before
    const beforeRes = await pool.query("SELECT COUNT(*) as c FROM app.runs");
    const countBefore = Number(beforeRes.rows[0].c);

    // 3. POST invalid run request (unknown field)
    const res = await fetch(`${baseUrl}/api/runs`, {
      method: "POST",
      body: JSON.stringify({ intentId, unknownField: "fail" }),
      headers: { "content-type": "application/json" }
    });
    expect(res.status).toBe(400);

    // 4. Count runs after
    const afterRes = await pool.query("SELECT COUNT(*) as c FROM app.runs");
    const countAfter = Number(afterRes.rows[0].c);

    expect(countAfter).toBe(countBefore);
  });
});
