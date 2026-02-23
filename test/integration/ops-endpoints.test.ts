import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { startApp } from "../../src/server/app";
import type { TestLifecycle } from "./lifecycle";
import { setupLifecycle, teardownLifecycle } from "./lifecycle";
import {
  generateOpsTestId,
  OPS_TEST_TIMEOUT,
  waitForWorkflowStatus
} from "../helpers/ops-fixtures";
import type { Pool } from "pg";

type AppHandle = {
  close: () => Promise<void>;
};

type AppCounts = {
  runs: number;
  steps: number;
  artifacts: number;
};

let lifecycle: TestLifecycle;
let app: AppHandle;

async function getAppCounts(pool: Pool): Promise<AppCounts> {
  const result = await pool.query<{
    runs: number;
    steps: number;
    artifacts: number;
  }>(
    `SELECT
       (SELECT COUNT(*)::int FROM app.runs) AS runs,
       (SELECT COUNT(*)::int FROM app.run_steps) AS steps,
       (SELECT COUNT(*)::int FROM app.artifacts) AS artifacts`
  );
  return result.rows[0];
}

beforeAll(async () => {
  lifecycle = await setupLifecycle(350);
  const opsViewsSql = await readFile(
    join(process.cwd(), "db/migrations/017_ops_views.sql"),
    "utf8"
  );
  await lifecycle.sysPool.query(opsViewsSql);
  const started = await startApp(lifecycle.pool, lifecycle.workflow);
  app = {
    close: () => new Promise<void>((resolve) => started.server.close(() => resolve()))
  };
});

afterAll(async () => {
  await app.close();
  await teardownLifecycle(lifecycle);
});

describe("ops endpoints (Cycle C2)", () => {
  const baseUrl = `http://127.0.0.1:${process.env.PORT ?? "3001"}/api/ops/wf`;

  test("GET /api/ops/wf lists workflows with strict envelope", async () => {
    const workflowID = generateOpsTestId("ops-list");
    await lifecycle.workflow.startCrashDemo(workflowID);
    await lifecycle.workflow.waitUntilComplete(workflowID, OPS_TEST_TIMEOUT);

    const res = await fetch(`${baseUrl}?limit=20`);
    expect(res.status).toBe(200);
    const rows = await res.json();
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.length).toBeLessThanOrEqual(20);
    expect(rows.some((row: { workflowID: string }) => row.workflowID === workflowID)).toBe(true);
    const row = rows.find(
      (item: { workflowID: string }) => item.workflowID === workflowID
    ) as Record<string, unknown>;
    expect(row.workflowID).toBe(workflowID);
    expect(typeof row.status).toBe("string");
    expect(typeof row.workflowName).toBe("string");
    expect(typeof row.workflowClassName).toBe("string");
    expect(typeof row.createdAt).toBe("number");

    const repeatRes = await fetch(`${baseUrl}?limit=20`);
    expect(repeatRes.status).toBe(200);
    const repeatRows = await repeatRes.json();
    expect(repeatRows).toEqual(rows);
  });

  test("GET /api/ops/wf rejects unknown query keys", async () => {
    const res = await fetch(`${baseUrl}?unknown=1`);
    expect(res.status).toBe(400);
  });

  test("GET /api/ops/queue-depth returns deterministic bounded rows", async () => {
    const workflowID = generateOpsTestId("ops-queue-depth");
    await lifecycle.workflow.startCrashDemo(workflowID);
    await lifecycle.workflow.waitUntilComplete(workflowID, OPS_TEST_TIMEOUT);

    const res = await fetch(
      `http://127.0.0.1:${process.env.PORT ?? "3001"}/api/ops/queue-depth?limit=5`
    );
    expect(res.status).toBe(200);
    const rows = await res.json();
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.length).toBeLessThanOrEqual(5);
    for (const row of rows as Array<Record<string, unknown>>) {
      expect(typeof row.queueName).toBe("string");
      expect(["ENQUEUED", "PENDING"]).toContain(row.status);
      expect(typeof row.workflowCount).toBe("number");
    }
  });

  test("GET /api/ops/queue-depth rejects unknown query keys", async () => {
    const res = await fetch(
      `http://127.0.0.1:${process.env.PORT ?? "3001"}/api/ops/queue-depth?x=1`
    );
    expect(res.status).toBe(400);
  });

  test("GET /api/ops/wf/:id returns 404 for missing workflow", async () => {
    const missing = generateOpsTestId("ops-missing");
    const res = await fetch(`${baseUrl}/${missing}`);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toContain("workflow not found");
  });

  test("GET /api/ops/wf/:id and /steps reflect DBOS state", async () => {
    const workflowID = generateOpsTestId("ops-get");
    await lifecycle.workflow.startCrashDemo(workflowID);
    await lifecycle.workflow.waitUntilComplete(workflowID, OPS_TEST_TIMEOUT);

    const getRes = await fetch(`${baseUrl}/${workflowID}`);
    expect(getRes.status).toBe(200);
    const summary = await getRes.json();
    expect(summary.workflowID).toBe(workflowID);

    const stepsRes = await fetch(`${baseUrl}/${workflowID}/steps`);
    expect(stepsRes.status).toBe(200);
    const steps = await stepsRes.json();
    expect(Array.isArray(steps)).toBe(true);
    expect(steps.length).toBeGreaterThan(0);
    expect(typeof steps[0].functionId).toBe("number");
  });

  test("POST /api/ops/wf/:id/cancel + /resume enforce semantics and envelopes", async () => {
    const workflowID = generateOpsTestId("ops-cancel");
    await lifecycle.workflow.startCrashDemo(workflowID);

    const cancelRes = await fetch(`${baseUrl}/${workflowID}/cancel`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ actor: "ops-endpoints-test", reason: "cancel-proof" })
    });
    expect(cancelRes.status).toBe(202);
    const cancelBody = await cancelRes.json();
    expect(cancelBody).toEqual({ accepted: true, workflowID });

    const cancelled = await waitForWorkflowStatus(
      lifecycle.workflow,
      workflowID,
      "CANCELLED",
      OPS_TEST_TIMEOUT
    );
    expect(cancelled).toBe("CANCELLED");

    const resumeRes = await fetch(`${baseUrl}/${workflowID}/resume`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ actor: "ops-endpoints-test", reason: "resume-proof" })
    });
    expect(resumeRes.status).toBe(202);
    const resumeBody = await resumeRes.json();
    expect(resumeBody).toEqual({ accepted: true, workflowID });
    await lifecycle.workflow.waitUntilComplete(workflowID, OPS_TEST_TIMEOUT);
    const resumedStatus = await lifecycle.workflow.getWorkflowStatus(workflowID);
    expect(resumedStatus).toBe("SUCCESS");
  });

  test("POST /api/ops/wf/:id/cancel returns 409 on terminal workflow", async () => {
    const workflowID = generateOpsTestId("ops-cancel-conflict");
    await lifecycle.workflow.startCrashDemo(workflowID);
    await lifecycle.workflow.waitUntilComplete(workflowID, OPS_TEST_TIMEOUT);

    const res = await fetch(`${baseUrl}/${workflowID}/cancel`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ actor: "ops-endpoints-test", reason: "cancel-terminal-proof" })
    });
    expect(res.status).toBe(409);
  });

  test("POST /api/ops/wf/:id/fork returns new workflowID", async () => {
    const workflowID = generateOpsTestId("ops-fork");
    await lifecycle.workflow.startCrashDemo(workflowID);
    await lifecycle.workflow.waitUntilComplete(workflowID, OPS_TEST_TIMEOUT);

    const stepsRes = await fetch(`${baseUrl}/${workflowID}/steps`);
    const steps = await stepsRes.json();
    const stepN = Math.max(
      ...steps.map((step: { functionId: number }) => step.functionId).filter(Number.isInteger)
    );

    const forkRes = await fetch(`${baseUrl}/${workflowID}/fork`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ stepN, actor: "ops-endpoints-test", reason: "fork-proof" })
    });
    expect(forkRes.status).toBe(202);
    const forkBody = await forkRes.json();
    expect(forkBody.accepted).toBe(true);
    expect(forkBody.workflowID).toBe(workflowID);
    expect(typeof forkBody.forkedWorkflowID).toBe("string");
    expect(forkBody.forkedWorkflowID).not.toBe(workflowID);
  });

  test("invalid ops payload returns 400 with zero app writes", async () => {
    const before = await getAppCounts(lifecycle.pool);
    const workflowID = generateOpsTestId("ops-invalid");
    const res = await fetch(`${baseUrl}/${workflowID}/fork`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ stepN: "bad", extra: true })
    });
    expect(res.status).toBe(400);
    const after = await getAppCounts(lifecycle.pool);
    expect(after).toEqual(before);
  });

  test("POST /api/ops/wf/:id/cancel rejects missing actor/reason", async () => {
    const workflowID = generateOpsTestId("ops-missing-audit");
    await lifecycle.workflow.startCrashDemo(workflowID);
    const res = await fetch(`${baseUrl}/${workflowID}/cancel`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({})
    });
    expect(res.status).toBe(400);
  });

  test("POST /api/ops/sleep fail-closes malformed query with zero app writes", async () => {
    const before = await getAppCounts(lifecycle.pool);
    const res = await fetch(
      `http://127.0.0.1:${process.env.PORT ?? "3001"}/api/ops/sleep?wf=&sleep=abc`,
      {
        method: "POST"
      }
    );
    expect(res.status).toBe(400);
    const after = await getAppCounts(lifecycle.pool);
    expect(after).toEqual(before);
  });
});
