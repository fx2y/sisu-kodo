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

async function launchShim(): Promise<() => Promise<void>> {
  const cfg = getConfig();
  const shimEngine = await DBOSClientWorkflowEngine.create(
    cfg.systemDatabaseUrl,
    pool,
    DBOS.applicationVersion
  );
  const shimApp = await startApp(pool, shimEngine);
  return async () => {
    await new Promise<void>((resolve) => shimApp.server.close(() => resolve()));
    await shimEngine.destroy();
  };
}

async function restartShim(): Promise<void> {
  if (stopShim) {
    await stopShim();
  }
  stopShim = await launchShim();
}

async function assertNoDuplicateRows(runId: string, workflowId: string): Promise<void> {
  const runDup = await pool.query<{ c: string }>(
    `select count(*)::text as c from app.runs where workflow_id = $1`,
    [workflowId]
  );
  expect(Number(runDup.rows[0]?.c ?? "0")).toBe(1);

  const stepDup = await pool.query<{ c: string }>(
    `select count(*)::text as c
     from (
       select step_id, count(*) as n
       from app.run_steps
       where run_id = $1
       group by step_id
       having count(*) > 1
     ) d`,
    [runId]
  );
  expect(Number(stepDup.rows[0]?.c ?? "0")).toBe(0);

  const artifactDup = await pool.query<{ c: string }>(
    `select count(*)::text as c
     from (
       select step_id, task_key, idx, attempt, count(*) as n
       from app.artifacts
       where run_id = $1
       group by step_id, task_key, idx, attempt
       having count(*) > 1
     ) d`,
    [runId]
  );
  expect(Number(artifactDup.rows[0]?.c ?? "0")).toBe(0);
}

beforeAll(async () => {
  process.env.OC_MODE = "live";
  IntentSteps.resetImpl();
  const cfg = getConfig();
  pool = createPool();

  daemon = new OCMockDaemon(cfg.ocServerPort);
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
  stopShim = await launchShim();
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
    let latest: RunView = { runId, workflowId: "", status: "unknown" };
    while (Date.now() < deadline) {
      try {
        latest = await readRun(runId);
      } catch {
        // API restart can briefly close sockets; keep polling until deadline.
      }
      if (latest.status === targetStatus) return latest;
      await new Promise((resolve) => setTimeout(resolve, 250));
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
    await assertNoDuplicateRows(firstRun.runId, firstIntentId);

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
    await assertNoDuplicateRows(secondRun.runId, secondIntentId);
  }, 120000);

  test("Shim survives API restart and worker restart while run is inflight", async () => {
    for (let i = 0; i < 2; i++) {
      daemon.pushResponse({
        info: {
          id: `msg-inflight-plan-${i}`,
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
          id: `msg-inflight-build-${i}`,
          structured_output: { patch: [], tests: ["t"], test_command: "ls" }
        }
      });
    }

    const intentId = await createIntent("shim inflight restarts");
    const run = await startIntent(intentId, "shim-trace-inflight");

    await restartShim();
    await waitForStatus(run.runId, "waiting_input");

    await shutdownWorker();
    await launchWorker();

    await approvePlan(run.runId);
    const done = await waitForStatus(run.runId, "succeeded");
    expect(done.workflowId).toBe(intentId);
    await assertNoDuplicateRows(run.runId, intentId);
  }, 120000);

  test("Shim can send events after workflow reaches waiting_input", async () => {
    daemon.pushResponse({
      info: {
        id: "msg-event-plan",
        structured_output: {
          goal: "event",
          design: ["d"],
          files: ["f"],
          risks: ["r"],
          tests: ["t"]
        }
      }
    });
    daemon.pushResponse({
      info: {
        id: "msg-event-build",
        structured_output: { patch: [], tests: ["t"], test_command: "ls" }
      }
    });

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
  }, 120000);
});
