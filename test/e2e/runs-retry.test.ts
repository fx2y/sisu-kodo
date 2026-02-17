import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { DBOS } from "@dbos-inc/dbos-sdk";
import type { Pool } from "pg";
import { createPool, closePool } from "../../src/db/pool";
import { startApp } from "../../src/server/app";
import { DBOSWorkflowEngine } from "../../src/workflow/engine-dbos";

let pool: Pool;
let stop: (() => Promise<void>) | undefined;
const PORT = "3009";

beforeAll(async () => {
  process.env.PORT = PORT;
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
  await closePool();
});

describe("runs retry e2e", () => {
  test("fails a run and then retries it", async () => {
    // 1. Create intent that fails
    const intentRes = await fetch(`http://127.0.0.1:${PORT}/intents`, {
      method: "POST",
      body: JSON.stringify({
        goal: "fail me",
        inputs: {},
        constraints: {}
      })
    });
    const { intentId } = (await intentRes.json()) as { intentId: string };

    // 2. Start run
    const runRes = await fetch(`http://127.0.0.1:${PORT}/intents/${intentId}/run`, {
      method: "POST"
    });
    const { runId } = (await runRes.json()) as { runId: string };

    // 3. Wait for terminal failure
    let runView: { status: string; nextAction?: string } | undefined;
    for (let i = 0; i < 30; i++) {
      const vRes = await fetch(`http://127.0.0.1:${PORT}/runs/${runId}`);
      runView = (await vRes.json()) as { status: string; nextAction?: string };
      if (runView.status === "failed") break;
      await new Promise((r) => setTimeout(r, 1000));
    }
    expect(runView?.status).toBe("failed");

    // 4. Retry (repair)
    const retryRes = await fetch(`http://127.0.0.1:${PORT}/runs/${runId}/retry`, {
      method: "POST"
    });
    expect(retryRes.status).toBe(202);

    // 5. Wait for repair to fail (since it still fails with "fail me")
    for (let i = 0; i < 30; i++) {
      const vRes = await fetch(`http://127.0.0.1:${PORT}/runs/${runId}`);
      runView = (await vRes.json()) as { status: string; nextAction?: string };
      if (runView.status === "retries_exceeded") break;
      await new Promise((r) => setTimeout(r, 1000));
    }
    expect(runView?.status).toBe("retries_exceeded");
    expect(runView?.nextAction).toBe("REPAIR");
  }, 120000);
});
