import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { DBOS } from "@dbos-inc/dbos-sdk";
import type { Pool } from "pg";
import { createPool, closePool } from "../../src/db/pool";
import { startApp } from "../../src/server/app";
import { DBOSWorkflowEngine } from "../../src/workflow/engine-dbos";
import { OCMockDaemon } from "../oc-mock-daemon";

type RunView = { status: string };

describe("plan approval api", () => {
  let pool: Pool;
  let stop: (() => Promise<void>) | undefined;
  let daemon: OCMockDaemon;
  const port = process.env.PORT ?? "3001";
  const baseUrl = `http://127.0.0.1:${port}`;

  const readRun = async (runId: string): Promise<RunView> => {
    const res = await fetch(`${baseUrl}/runs/${runId}`);
    return (await res.json()) as RunView;
  };

  const waitForStatus = async (runId: string, status: string): Promise<void> => {
    const endAt = Date.now() + 20000;
    while (Date.now() < endAt) {
      const run = await readRun(runId);
      if (run.status === status) return;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    throw new Error(`timed out waiting for ${status}`);
  };

  const waitForAnyStatus = async (runId: string, statuses: string[]): Promise<void> => {
    const allowed = new Set(statuses);
    const endAt = Date.now() + 20000;
    while (Date.now() < endAt) {
      const run = await readRun(runId);
      if (allowed.has(run.status)) return;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    throw new Error(`timed out waiting for one of: ${statuses.join(", ")}`);
  };

  const createRun = async (): Promise<string> => {
    const intentRes = await fetch(`${baseUrl}/intents`, {
      method: "POST",
      body: JSON.stringify({ goal: "approval api", inputs: {}, constraints: {} }),
      headers: { "content-type": "application/json" }
    });
    const { intentId } = (await intentRes.json()) as { intentId: string };

    const runRes = await fetch(`${baseUrl}/intents/${intentId}/run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({})
    });
    const { runId } = (await runRes.json()) as { runId: string };
    return runId;
  };

  beforeAll(async () => {
    process.env.OC_MODE = "live";
    await DBOS.launch();
    pool = createPool();
    await pool.query(
      "TRUNCATE app.intents, app.runs, app.run_steps, app.artifacts, app.plan_approvals CASCADE"
    );
    daemon = new OCMockDaemon();
    await daemon.start();
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

  test("returns 400 for invalid approval payload", async () => {
    daemon.pushResponse({
      info: {
        id: "msg-plan-invalid",
        structured_output: {
          goal: "approval api",
          design: ["d"],
          files: ["f.ts"],
          risks: ["r"],
          tests: ["t"]
        }
      }
    });

    const runId = await createRun();
    await waitForStatus(runId, "waiting_input");

    const res = await fetch(`${baseUrl}/runs/${runId}/approve-plan`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ notes: "missing approvedBy" })
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("PlanApprovalRequest");

    // Drain run to terminal state so DBOS shutdown is not blocked by waiting_input.
    daemon.pushResponse({
      info: {
        id: "msg-build-after-invalid",
        structured_output: {
          patch: [],
          tests: ["t"],
          test_command: "ls"
        }
      }
    });
    const approveRes = await fetch(`${baseUrl}/runs/${runId}/approve-plan`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ approvedBy: "cleanup" })
    });
    expect(approveRes.status).toBe(202);
    await waitForAnyStatus(runId, ["succeeded", "retries_exceeded"]);
  });

  test("returns deterministic acceptance envelope", async () => {
    daemon.pushResponse({
      info: {
        id: "msg-plan-valid",
        structured_output: {
          goal: "approval api",
          design: ["d"],
          files: ["f.ts"],
          risks: ["r"],
          tests: ["t"]
        }
      }
    });
    daemon.pushResponse({
      info: {
        id: "msg-build-valid",
        structured_output: {
          patch: [],
          tests: ["t"],
          test_command: "ls"
        }
      }
    });

    const runId = await createRun();
    await waitForStatus(runId, "waiting_input");

    const res = await fetch(`${baseUrl}/runs/${runId}/approve-plan`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ approvedBy: "api-test", notes: "ok" })
    });
    expect(res.status).toBe(202);

    const body = (await res.json()) as {
      accepted: boolean;
      runId: string;
      approvedAt: string;
    };
    expect(body.accepted).toBe(true);
    expect(body.runId).toBe(runId);
    expect(Number.isNaN(Date.parse(body.approvedAt))).toBe(false);

    await waitForStatus(runId, "succeeded");
  });
});
