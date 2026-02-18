import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { DBOS } from "@dbos-inc/dbos-sdk";
import type { Pool } from "pg";
import { createPool, closePool } from "../../src/db/pool";
import { startApp } from "../../src/server/app";
import { DBOSClientWorkflowEngine } from "../../src/api-shim/dbos-client";
import { getConfig } from "../../src/config";
import "../../src/workflow/dbos/intentWorkflow";
import "../../src/workflow/dbos/crashDemoWorkflow";
import { OCMockDaemon } from "../oc-mock-daemon";
import { IntentSteps } from "../../src/workflow/dbos/intentSteps";

let pool: Pool;
let stopWorker: (() => Promise<void>) | undefined;
let stopShim: (() => Promise<void>) | undefined;
let daemon: OCMockDaemon;

type RunView = {
  runId: string;
  workflowId: string;
  status: string;
  lastStep?: string;
};

beforeAll(async () => {
  process.env.OC_MODE = "live";
  IntentSteps.resetImpl();
  const cfg = getConfig();
  pool = createPool();

  // Clean app schema for deterministic repeated runs
  await pool.query(
    "TRUNCATE app.intents, app.runs, app.run_steps, app.artifacts, app.plan_approvals CASCADE"
  );

  daemon = new OCMockDaemon();
  await daemon.start();

  await DBOS.launch();
  stopWorker = async () => {
    await DBOS.shutdown();
  };

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
  if (daemon) await daemon.stop();
  await pool.end();
  await closePool();
});

describe("Plan/Build Approval Gate E2E", () => {
  const baseUrl = `http://127.0.0.1:${process.env.PORT ?? "3001"}`;

  async function createIntent(goal: string): Promise<string> {
    const res = await fetch(`${baseUrl}/intents`, {
      method: "POST",
      body: JSON.stringify({ goal, inputs: {}, constraints: {} }),
      headers: { "content-type": "application/json" }
    });
    const body = (await res.json()) as { intentId: string };
    return body.intentId;
  }

  async function startIntent(intentId: string): Promise<{ runId: string }> {
    const res = await fetch(`${baseUrl}/intents/${intentId}/run`, {
      method: "POST",
      body: JSON.stringify({ traceId: `trace-${intentId}` }),
      headers: { "content-type": "application/json" }
    });
    return (await res.json()) as { runId: string };
  }

  async function readRun(runId: string): Promise<RunView> {
    const res = await fetch(`${baseUrl}/runs/${runId}`);
    return (await res.json()) as RunView;
  }

  async function waitForStatus(runId: string, status: string, timeout = 10000): Promise<RunView> {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const run = await readRun(runId);
      if (run.status === status) return run;
      await new Promise((r) => setTimeout(r, 200));
    }
    const last = await readRun(runId);
    throw new Error(
      `Timed out waiting for status ${status}. Current: ${last.status}, Last Step: ${last.lastStep}`
    );
  }

  test("workflow gates build until approval API is called", async () => {
    // 1. Prepare mock responses: Plan, then Build
    daemon.pushResponse({
      info: {
        id: "msg-plan",
        structured_output: {
          goal: "e2e plan build test",
          design: ["d1"],
          files: ["f1.ts"],
          risks: ["r1"],
          tests: ["t1.test.ts"]
        }
      }
    });
    daemon.pushResponse({
      info: {
        id: "msg-build",
        structured_output: {
          patch: [{ path: "f1.ts", diff: "diff1" }],
          tests: ["t1.test.ts"],
          test_command: "ls"
        }
      }
    });

    // 2. Start run
    const intentId = await createIntent("e2e plan build test");
    const { runId } = await startIntent(intentId);

    // 3. Wait for gate
    const gated = await waitForStatus(runId, "waiting_input");
    expect(gated.lastStep).toBe("ApplyPatchST"); // ApplyPatchST finished, but DecideST (Build) is gated

    // 4. Approve plan via API
    const approveRes = await fetch(`${baseUrl}/runs/${runId}/approve-plan`, {
      method: "POST",
      body: JSON.stringify({ approvedBy: "test-user" }),
      headers: { "content-type": "application/json" }
    });
    expect(approveRes.status).toBe(202);

    // 5. Verify it completes
    const succeeded = await waitForStatus(runId, "succeeded");
    expect(succeeded.lastStep).toBe("ExecuteST");
  }, 30000);
});
