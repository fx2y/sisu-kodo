import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import type { Pool } from "pg";
import { createPool } from "../../src/db/pool";
import { startApp } from "../../src/server/app";
import type { WorkflowService } from "../../src/workflow/port";

let pool: Pool;
let stop: (() => Promise<void>) | undefined;

const mockWorkflow: WorkflowService = {
  startIntentRun: vi.fn(),
  startRepairRun: vi.fn(),
  sendEvent: vi.fn(),
  startCrashDemo: vi.fn(),
  marks: vi.fn(),
  resumeIncomplete: vi.fn(),
  getWorkflowStatus: vi.fn(),
  waitUntilComplete: vi.fn(),
  destroy: vi.fn()
};

beforeAll(async () => {
  pool = createPool();
  // Ensure we are using a random port for integration test isolation
  const app = await startApp(pool, mockWorkflow);
  stop = async () => {
    await new Promise<void>((resolve) => app.server.close(() => resolve()));
  };
});

afterAll(async () => {
  if (stop) await stop();
  await pool.end();
});

describe("run-trigger-failclosed integration", () => {
  const baseUrl = `http://127.0.0.1:${process.env.PORT ?? "3001"}`;

  test("updates run status to 'failed' if workflow trigger fails", async () => {
    // 1. Create intent
    const intentRes = await fetch(`${baseUrl}/intents`, {
      method: "POST",
      body: JSON.stringify({ goal: "test fail-closed", inputs: {}, constraints: {} }),
      headers: { "content-type": "application/json" }
    });
    const { intentId } = await intentRes.json();

    // 2. Mock workflow failure
    vi.mocked(mockWorkflow.startIntentRun).mockRejectedValueOnce(new Error("Trigger failed"));

    // 3. POST run request
    const runRes = await fetch(`${baseUrl}/intents/${intentId}/run`, {
      method: "POST",
      body: JSON.stringify({}),
      headers: { "content-type": "application/json" }
    });

    // Expect 500 error from http server
    expect(runRes.status).toBe(500);

    // 4. Verify run status in DB is 'failed'
    const res = await pool.query("SELECT status FROM app.runs WHERE intent_id = $1", [intentId]);
    expect(res.rows[0].status).toBe("failed");
  });
});
