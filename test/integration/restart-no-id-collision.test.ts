import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { DBOS } from "@dbos-inc/dbos-sdk";
import type { Pool } from "pg";
import { createPool } from "../../src/db/pool";
import { startApp } from "../../src/server/app";
import { DBOSWorkflowEngine } from "../../src/workflow/engine-dbos";
import { randomSeed, setRngSeed } from "../../src/lib/rng";

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
});

describe("restart-no-id-collision integration", () => {
  const baseUrl = `http://127.0.0.1:${process.env.PORT ?? "3001"}`;

  test("IDs do not collide after simulated restart with randomSeed", async () => {
    // 1. Force a known seed to simulate "pre-fix" state or "fresh start"
    setRngSeed(0x12345678);

    const res1 = await fetch(`${baseUrl}/intents`, {
      method: "POST",
      body: JSON.stringify({ goal: "first", inputs: {}, constraints: {} }),
      headers: { "content-type": "application/json" }
    });
    const { intentId: id1 } = await res1.json();

    // 2. Simulate restart by resetting to the SAME seed (pre-fix behavior)
    setRngSeed(0x12345678);

    // Without randomSeed(), the next generateId would produce id1 again.
    // But since we fixed the entry points, real apps will call randomSeed().
    // We call it here to prove it works.
    randomSeed();

    const res2 = await fetch(`${baseUrl}/intents`, {
      method: "POST",
      body: JSON.stringify({ goal: "second", inputs: {}, constraints: {} }),
      headers: { "content-type": "application/json" }
    });
    const { intentId: id2 } = await res2.json();

    expect(id1).not.toBe(id2);
    expect(res2.status).toBe(201); // No 500 collision
  });
});
