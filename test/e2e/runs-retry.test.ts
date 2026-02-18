import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { DBOS } from "@dbos-inc/dbos-sdk";
import type { Pool } from "pg";
import { createPool, closePool } from "../../src/db/pool";
import { startApp } from "../../src/server/app";
import { DBOSWorkflowEngine } from "../../src/workflow/engine-dbos";
import { OCMockDaemon } from "../oc-mock-daemon";

let pool: Pool;
let stop: (() => Promise<void>) | undefined;
let daemon: OCMockDaemon;
const PORT = "3009";

beforeAll(async () => {
  process.env.OC_MODE = "live";
  process.env.PORT = PORT;
  await DBOS.launch();
  pool = createPool();

  daemon = new OCMockDaemon();
  await daemon.start();

  // Clean app schema for deterministic repeated runs
  await pool.query(
    "TRUNCATE app.intents, app.runs, app.run_steps, app.artifacts, app.plan_approvals CASCADE"
  );

  const workflow = new DBOSWorkflowEngine(25);
  const app = await startApp(pool, workflow);
  stop = async () => {
    await new Promise<void>((resolve) => app.server.close(() => resolve()));
    await DBOS.shutdown();
  };
});

afterAll(async () => {
  if (stop) await stop();
  if (daemon) await daemon.stop();
  await pool.end();
  await closePool();
});

describe("runs retry e2e", () => {
  test("fails a run and then retries it", async () => {
    // Push 2 responses
    daemon.pushResponse({
      info: {
        id: "msg-plan",
        structured_output: {
          goal: "fail me",
          design: ["d"],
          files: ["f"],
          risks: ["r"],
          tests: ["t"]
        }
      }
    });
    daemon.pushResponse({
      info: {
        id: "msg-build",
        structured_output: { patch: [], tests: ["t"], test_command: "FAIL_ME" }
      }
    });

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

    // 3. Wait for terminal retries_exceeded projection
    let runView: { status: string; nextAction?: string; retryCount: number } | undefined;
    for (let i = 0; i < 30; i++) {
      const vRes = await fetch(`http://127.0.0.1:${PORT}/runs/${runId}`);
      runView = (await vRes.json()) as { status: string; nextAction?: string; retryCount: number };
      if (runView.status === "waiting_input") {
        await fetch(`http://127.0.0.1:${PORT}/runs/${runId}/approve-plan`, {
          method: "POST",
          body: JSON.stringify({ approvedBy: "test" }),
          headers: { "content-type": "application/json" }
        });
      }
      if (runView.status === "retries_exceeded") break;
      await new Promise((r) => setTimeout(r, 1000));
    }
    expect(runView?.status).toBe("retries_exceeded");
    expect(runView?.retryCount).toBe(0);
    expect(runView?.nextAction).toBe("REPAIR");

    // 4. Retry (repair)
    const retryRes = await fetch(`http://127.0.0.1:${PORT}/runs/${runId}/retry`, {
      method: "POST"
    });
    expect(retryRes.status).toBe(202);
    const retryBody = (await retryRes.json()) as {
      accepted: boolean;
      newRunId: string;
      fromStep: string;
    };
    expect(retryBody).toEqual({
      accepted: true,
      newRunId: runId,
      fromStep: "ExecuteST"
    });

    // 5. Wait for repair to start (status change)
    for (let i = 0; i < 20; i++) {
      const vRes = await fetch(`http://127.0.0.1:${PORT}/runs/${runId}`);
      runView = (await vRes.json()) as { status: string; nextAction?: string; retryCount: number };
      if (runView.status === "repairing" || runView.retryCount > 0) break;
      await new Promise((r) => setTimeout(r, 200));
    }

    // 6. Wait for repair to fail (since it still fails with "fail me")
    for (let i = 0; i < 30; i++) {
      const vRes = await fetch(`http://127.0.0.1:${PORT}/runs/${runId}`);
      runView = (await vRes.json()) as { status: string; nextAction?: string; retryCount: number };
      if (runView.status === "retries_exceeded" && runView.retryCount >= 1) break;
      await new Promise((r) => setTimeout(r, 1000));
    }
    expect(runView?.status).toBe("retries_exceeded");
    expect(runView?.retryCount).toBe(1);
    expect(runView?.nextAction).toBe("REPAIR");
  }, 120000);
});
