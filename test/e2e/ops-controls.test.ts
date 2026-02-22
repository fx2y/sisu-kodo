/**
 * C3.T6: E2E Ops Controls.
 * Verifies cancel/resume/fork via public HTTP API (/api/ops/wf/...).
 */
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { DBOS } from "@dbos-inc/dbos-sdk";
import type { Pool } from "pg";

import { createPool } from "../../src/db/pool";
import { startApp } from "../../src/server/app";
import { DBOSWorkflowEngine } from "../../src/workflow/engine-dbos";
import { randomSeed } from "../../src/lib/rng";
import { initQueues } from "../../src/workflow/dbos/queues";
import { configureDBOSRuntime } from "../../src/lib/otlp";
import { getConfig } from "../../src/config";

let pool: Pool;
let stop: (() => Promise<void>) | undefined;
const port = process.env.PORT || "3006";
const baseUrl = `http://127.0.0.1:${port}`;

beforeAll(async () => {
  const cfg = getConfig();
  configureDBOSRuntime(cfg);
  initQueues();
  await DBOS.launch();
  pool = createPool();
  // Using 25ms engine sleep for general tests, but slowstep will override via param
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

describe("E2E: Ops Controls (C3.T6)", () => {
  test("cancel and resume flow via HTTP", async () => {
    randomSeed();
    const wf = `e2e_ops_${Math.floor(Math.random() * 1000000)}`;

    // Start slow step (5s sleep)
    const startRes = await fetch(`${baseUrl}/slowstep?wf=${wf}&sleep=5000`, { method: "POST" });
    expect(startRes.status).toBe(202);

    // Wait for s1 mark
    let s1 = false;
    for (let i = 0; i < 60; i++) {
      const marksRes = await fetch(`${baseUrl}/slowmarks?wf=${wf}`);
      const marks = await marksRes.json();
      if (marks.s1 === 1) {
        s1 = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    expect(s1).toBe(true);

    // Cancel via API
    const cancelRes = await fetch(`${baseUrl}/api/ops/wf/${wf}/cancel`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ actor: "e2e-tester", reason: "test-cancel" })
    });
    expect(cancelRes.status).toBe(202);

    // Verify status is CANCELLED
    let cancelled = false;
    for (let i = 0; i < 30; i++) {
      const statusRes = await fetch(`${baseUrl}/api/ops/wf/${wf}`);
      const status = await statusRes.json();
      if (status.status === "CANCELLED") {
        cancelled = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    expect(cancelled).toBe(true);

    // Resume via API
    const resumeRes = await fetch(`${baseUrl}/api/ops/wf/${wf}/resume`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ actor: "e2e-tester", reason: "test-resume" })
    });
    expect(resumeRes.status).toBe(202);

    // Wait for completion (s2 mark)
    let s2 = false;
    for (let i = 0; i < 60; i++) {
      const marksRes = await fetch(`${baseUrl}/slowmarks?wf=${wf}`);
      const marks = await marksRes.json();
      if (marks.s2 === 1) {
        s2 = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    expect(s2).toBe(true);

    const finalStatusRes = await fetch(`${baseUrl}/api/ops/wf/${wf}`);
    const finalStatus = await finalStatusRes.json();
    expect(finalStatus.status).toBe("SUCCESS");
  }, 90000);

  test("fork flow via HTTP", async () => {
    randomSeed();
    const wf = `e2e_fork_${Math.floor(Math.random() * 1000000)}`;

    // Start and let it finish quickly
    const startRes = await fetch(`${baseUrl}/slowstep?wf=${wf}&sleep=100`, { method: "POST" });
    expect(startRes.status).toBe(202);

    // Wait for SUCCESS
    let success = false;
    for (let i = 0; i < 20; i++) {
      const statusRes = await fetch(`${baseUrl}/api/ops/wf/${wf}`);
      const status = await statusRes.json();
      if (status.status === "SUCCESS") {
        success = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    expect(success).toBe(true);

    // Fork from step 1
    const forkRes = await fetch(`${baseUrl}/api/ops/wf/${wf}/fork`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ actor: "e2e-tester", reason: "test-fork", stepN: 1 })
    });
    expect(forkRes.status).toBe(202);
    const forkAck = await forkRes.json();
    expect(forkAck.workflowID).toBe(wf);
    expect(forkAck.forkedWorkflowID).toBeDefined();
    expect(forkAck.forkedWorkflowID).not.toBe(wf);

    // Wait for forked completion
    let forkSuccess = false;
    for (let i = 0; i < 20; i++) {
      const statusRes = await fetch(`${baseUrl}/api/ops/wf/${forkAck.forkedWorkflowID}`);
      const status = await statusRes.json();
      if (status.status === "SUCCESS") {
        forkSuccess = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    expect(forkSuccess).toBe(true);
  }, 30000);

  test("artifact persistence for intent-based workflow", async () => {
    randomSeed();
    const intentId = `intent_${Math.floor(Math.random() * 1000000)}`;

    // Create intent
    await pool.query(`INSERT INTO app.intents (id, goal, payload) VALUES ($1, $2, $3)`, [
      intentId,
      "artifact-test",
      {}
    ]);

    // Cancel the (non-existent but registered) intent run to trigger artifact
    // In practice, we just need a row in app.runs for the FK.
    await pool.query(
      `INSERT INTO app.runs (id, intent_id, status, workflow_id) VALUES ($1, $2, $3, $4)`,
      [intentId, intentId, "pending", intentId]
    );

    const _cancelRes = await fetch(`${baseUrl}/api/ops/wf/${intentId}/cancel`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ actor: "e2e-tester", reason: "verify-artifact" })
    });
    // It might return 202 or 409 depending on if DBOS actually has the workflow.
    // But persistence happens in the handler before/after service call.
    // Since service.cancelWorkflow(intentId) might fail if DBOS doesn't know intentId,
    // let's ensure we use a real DBOS workflow or just check the artifact if accepted.

    // To be safe, let's start a real crashdemo and insert its run row.
    const wf = `wf_artifact_${Math.floor(Math.random() * 1000000)}`;
    await fetch(`${baseUrl}/crashdemo?wf=${wf}`, { method: "POST" });
    const runId = `run_${wf}`;
    await pool.query(
      `INSERT INTO app.runs (id, intent_id, status, workflow_id) VALUES ($1, $2, $3, $4)`,
      [runId, intentId, "pending", wf]
    );

    const res = await fetch(`${baseUrl}/api/ops/wf/${wf}/cancel`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ actor: "e2e-tester", reason: "artifact-proof" })
    });
    expect(res.status).toBe(202);

    const artifactRes = await pool.query(
      `SELECT * FROM app.artifacts WHERE run_id = $1 AND step_id = 'OPS'`,
      [runId]
    );
    expect(artifactRes.rowCount).toBe(1);
    const artifact = artifactRes.rows[0];
    expect(artifact.inline.op).toBe("cancel");
    expect(artifact.inline.reason).toBe("artifact-proof");
    expect(artifact.kind).toBe("json_diagnostic");
  });
});
