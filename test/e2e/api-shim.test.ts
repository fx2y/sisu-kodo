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
import { initQueues } from "../../src/workflow/dbos/queues";

let pool: Pool;
let stopWorker: (() => Promise<void>) | undefined;
let stopShim: (() => Promise<void>) | undefined;
let daemon: OCMockDaemon;

type RunView = {
  runId: string;
  workflowId: string;
  status: string;
};

async function launchWorker(): Promise<void> {
  initQueues();
  await DBOS.launch();
}

async function shutdownWorker(): Promise<void> {
  await DBOS.shutdown();
}

beforeAll(async () => {
  process.env.OC_MODE = "live";
  IntentSteps.resetImpl();
  const cfg = getConfig();
  pool = createPool();

  daemon = new OCMockDaemon();
  await daemon.start();

  // Clean app schema for deterministic repeated runs
  await pool.query(
    "TRUNCATE app.intents, app.runs, app.run_steps, app.artifacts, app.plan_approvals CASCADE"
  );

  await launchWorker();
  stopWorker = async () => {
    await shutdownWorker();
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
  if (daemon) await daemon.stop();
  await pool.end();
  await closePool();
});

describe("API Shim E2E", () => {
  const baseUrl = `http://127.0.0.1:${process.env.PORT ?? "3001"}`;

  async function createIntent(
    goal: string,
    constraints: Record<string, unknown> = {}
  ): Promise<string> {
    const intentRes = await fetch(`${baseUrl}/intents`, {
      method: "POST",
      body: JSON.stringify({
        goal,
        inputs: {},
        constraints
      }),
      headers: { "content-type": "application/json" }
    });
    const body = (await intentRes.json()) as { intentId: string };
    return body.intentId;
  }

  async function startIntent(
    intentId: string,
    traceId: string
  ): Promise<{ runId: string; workflowId: string }> {
    const runRes = await fetch(`${baseUrl}/intents/${intentId}/run`, {
      method: "POST",
      body: JSON.stringify({ traceId, queuePartitionKey: "e2e-test" }),
      headers: { "content-type": "application/json" }
    });
    expect(runRes.status).toBe(202);
    return (await runRes.json()) as { runId: string; workflowId: string };
  }

  async function readRun(idOrWorkflowId: string): Promise<RunView> {
    const res = await fetch(`${baseUrl}/runs/${idOrWorkflowId}`);
    expect(res.status).toBe(200);
    return (await res.json()) as RunView;
  }

  async function waitForStatus(
    runId: string,
    targetStatus: string,
    timeoutMs = 60000
  ): Promise<RunView> {
    const deadline = Date.now() + timeoutMs;
    let latest: RunView = await readRun(runId);
    while (Date.now() < deadline) {
      if (latest.status === targetStatus) return latest;
      await new Promise((resolve) => setTimeout(resolve, 250));
      latest = await readRun(runId);
    }
    throw new Error(`timed out waiting for status=${targetStatus}; last=${latest.status}`);
  }

  async function approvePlan(runId: string): Promise<void> {
    const res = await fetch(`${baseUrl}/runs/${runId}/approve-plan`, {
      method: "POST",
      body: JSON.stringify({ approvedBy: "test" }),
      headers: { "content-type": "application/json" }
    });
    expect(res.status).toBe(202);
  }

  test("Shim reaches terminal success and survives worker restart", async () => {
    // Push 6 responses (2 per run, 3 runs total in this file)
    for (let i = 0; i < 6; i++) {
      daemon.pushResponse({
        info: {
          id: `msg-plan-${i}`,
          structured_output: {
            goal: "shim",
            design: ["d"],
            files: ["f"],
            risks: ["r"],
            tests: ["t"]
          }
        }
      });
      daemon.pushResponse({
        info: {
          id: `msg-build-${i}`,
          structured_output: { patch: [], tests: ["t"], test_command: "ls" }
        }
      });
    }

    const firstIntentId = await createIntent("shim goal one");
    const firstRun = await startIntent(firstIntentId, "shim-trace-1");
    await waitForStatus(firstRun.runId, "waiting_input");
    await approvePlan(firstRun.runId);
    const firstDone = await waitForStatus(firstRun.runId, "succeeded");
    expect(firstDone.workflowId).toBe(firstIntentId);

    const byWorkflow = await readRun(firstIntentId);
    expect(byWorkflow.runId).toBe(firstRun.runId);
    expect(byWorkflow.status).toBe("succeeded");

    await shutdownWorker();
    await launchWorker();

    const secondIntentId = await createIntent("shim goal two");
    const secondRun = await startIntent(secondIntentId, "shim-trace-2");
    await waitForStatus(secondRun.runId, "waiting_input");
    await approvePlan(secondRun.runId);
    const secondDone = await waitForStatus(secondRun.runId, "succeeded");
    expect(secondDone.workflowId).toBe(secondIntentId);
  }, 120000);

  test("Shim can send events after workflow reaches waiting_input", async () => {
    const intentId = await createIntent("event goal", { waitForHumanInput: true });
    const run = await startIntent(intentId, "event-trace");
    await waitForStatus(run.runId, "waiting_input");

    const eventRes = await fetch(`${baseUrl}/runs/${run.runId}/events`, {
      method: "POST",
      body: JSON.stringify({ type: "input", payload: { answer: "42" } }),
      headers: { "content-type": "application/json" }
    });
    expect(eventRes.status).toBe(202);
    // After HITL event, it will reach the Plan Approval gate
    await waitForStatus(run.runId, "waiting_input");
    await approvePlan(run.runId);
    await waitForStatus(run.runId, "succeeded");
  });
});
