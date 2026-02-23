import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { DBOS } from "@dbos-inc/dbos-sdk";
import { Pool as PgPool, type Pool } from "pg";
import { createPool, closePool } from "../../src/db/pool";
import { startApp } from "../../src/server/app";
import { DBOSClientWorkflowEngine } from "../../src/api-shim/dbos-client";
import { getConfig } from "../../src/config";
import "../../src/workflow/dbos/intentWorkflow";
import "../../src/workflow/dbos/crashDemoWorkflow";
import { OCMockDaemon } from "../oc-mock-daemon";
import { IntentSteps } from "../../src/workflow/dbos/intentSteps";
import { initQueues } from "../../src/workflow/dbos/queues";
import { findLatestGateByRunId } from "../../src/db/humanGateRepo";

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
  const shutdown = DBOS.shutdown();
  const timeout = new Promise<never>((_, reject) => {
    setTimeout(
      () => reject(new Error("DBOS.shutdown timed out in test/e2e/api-shim.test.ts")),
      5000
    );
  });
  await Promise.race([shutdown, timeout]);
}

async function clearStaleIntentWorkflows(systemDatabaseUrl: string): Promise<void> {
  const sysPool = new PgPool({ connectionString: systemDatabaseUrl });
  try {
    await sysPool.query(
      `DELETE FROM dbos.workflow_events
       WHERE workflow_uuid IN (
         SELECT workflow_uuid FROM dbos.workflow_status WHERE class_name = 'IntentWorkflow'
       )`
    );
    await sysPool.query("DELETE FROM dbos.workflow_status WHERE class_name = 'IntentWorkflow'");
  } finally {
    await sysPool.end();
  }
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
    "TRUNCATE app.intents, app.runs, app.run_steps, app.artifacts, app.plan_approvals, app.human_gates, app.human_interactions CASCADE"
  );
  await clearStaleIntentWorkflows(cfg.systemDatabaseUrl);

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
  const runNonce = `${process.pid}-${Date.now()}`;

  function enqueuePlanBuildPairs(count: number, prefix: string): void {
    for (let i = 0; i < count; i += 1) {
      daemon.pushAgentResponse("plan", {
        info: {
          id: `${prefix}-plan-${i}`,
          structured_output: {
            goal: "shim",
            design: ["d"],
            files: ["f"],
            risks: ["r"],
            tests: ["t"]
          }
        }
      });
      daemon.pushAgentResponse("build", {
        info: {
          id: `${prefix}-build-${i}`,
          structured_output: { patch: [], tests: ["t"], test_command: "ls" }
        }
      });
    }
  }

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
    let gate = await findLatestGateByRunId(pool, runId);
    for (let i = 0; i < 20 && !gate; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      gate = await findLatestGateByRunId(pool, runId);
    }
    if (!gate) throw new Error(`missing gate for run ${runId}`);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const res = await fetch(`${baseUrl}/api/runs/${runId}/gates/${gate.gate_key}/reply`, {
        method: "POST",
        body: JSON.stringify({
          payload: { choice: "yes", rationale: "approved-in-e2e" },
          dedupeKey: `approve-${runNonce}-${runId}-${gate.gate_key}-${attempt}`,
          origin: "manual"
        }),
        headers: { "content-type": "application/json" }
      });
      expect(res.status).toBe(200);

      await new Promise((resolve) => setTimeout(resolve, 150));
      const latest = await readRun(runId);
      if (latest.status !== "waiting_input") return;
    }
  }

  test("Shim reaches terminal success and survives worker restart", async () => {
    enqueuePlanBuildPairs(2, "msg");

    const firstIntentId = await createIntent(`shim goal one ${runNonce}`);
    const firstRun = await startIntent(firstIntentId, `shim-trace-1-${runNonce}`);
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

    const secondIntentId = await createIntent(`shim goal two ${runNonce}`);
    const secondRun = await startIntent(secondIntentId, `shim-trace-2-${runNonce}`);
    await waitForStatus(secondRun.runId, "waiting_input");
    await approvePlan(secondRun.runId);
    const secondDone = await waitForStatus(secondRun.runId, "succeeded");
    expect(secondDone.workflowId).toBe(secondIntentId);
    await assertNoDuplicateRows(secondRun.runId, secondIntentId);
  }, 120000);

  test("Shim survives API restart while inflight and worker restart after terminal", async () => {
    enqueuePlanBuildPairs(1, "msg-inflight");

    const intentId = await createIntent(`shim inflight restarts ${runNonce}`);
    const run = await startIntent(intentId, `shim-trace-inflight-${runNonce}`);

    await restartShim();
    await waitForStatus(run.runId, "waiting_input");
    await approvePlan(run.runId);
    const done = await waitForStatus(run.runId, "succeeded");
    expect(done.workflowId).toBe(intentId);
    await assertNoDuplicateRows(run.runId, intentId);
    await shutdownWorker();
    await launchWorker();
  }, 120000);

  test("Shim can send events after workflow reaches waiting_input", async () => {
    enqueuePlanBuildPairs(1, "msg-event");

    const intentId = await createIntent(`event goal ${runNonce}`);
    const run = await startIntent(intentId, `event-trace-${runNonce}`);
    await waitForStatus(run.runId, "waiting_input");

    const eventRes = await fetch(`${baseUrl}/runs/${run.runId}/events`, {
      method: "POST",
      body: JSON.stringify({
        type: "approve-plan",
        payload: { approvedBy: `event-test-${runNonce}` }
      }),
      headers: { "content-type": "application/json" }
    });
    expect(eventRes.status).toBe(202);
    await waitForStatus(run.runId, "succeeded");
  }, 120000);
});
