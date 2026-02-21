process.env.OC_MODE = "live";
const daemonPort = 4104;
process.env.OC_BASE_URL = `http://127.0.0.1:${daemonPort}`;

import { afterAll, beforeAll, describe, expect, test, beforeEach } from "vitest";
import { DBOS } from "@dbos-inc/dbos-sdk";
import type { Pool } from "pg";
import * as fs from "node:fs/promises";
import * as path from "node:path";

import { createPool } from "../../src/db/pool";
import { startApp } from "../../src/server/app";
import { DBOSWorkflowEngine } from "../../src/workflow/engine-dbos";
import { initQueues } from "../../src/workflow/dbos/queues";
import { normalizeForSnapshot } from "../../src/lib/normalize";
import { OCMockDaemon } from "../oc-mock-daemon";
import { setRngSeed } from "../../src/lib/rng";

let pool: Pool;
let daemon: OCMockDaemon;
let cleanup: () => Promise<void>;

async function shutdownDbosBounded(timeoutMs = 5000): Promise<void> {
  const shutdown = DBOS.shutdown();
  const timeout = new Promise<void>((_, reject) => {
    setTimeout(() => reject(new Error(`DBOS.shutdown timed out after ${timeoutMs}ms`)), timeoutMs);
  });
  try {
    await Promise.race([shutdown, timeout]);
  } catch (error) {
    console.error("[e2e:run-view-golden] shutdown warning:", error);
  }
}

beforeAll(async () => {
  initQueues();
  await DBOS.launch();
  pool = createPool();

  // Clean app schema for deterministic repeated runs
  await pool.query(
    "TRUNCATE app.intents, app.runs, app.run_steps, app.artifacts, app.plan_approvals CASCADE"
  );

  const workflow = new DBOSWorkflowEngine(25);
  const app = await startApp(pool, workflow);

  daemon = new OCMockDaemon(daemonPort);
  await daemon.start();

  cleanup = async () => {
    await daemon.stop();
    await new Promise<void>((resolve) => app.server.close(() => resolve()));
    await shutdownDbosBounded();
  };
});

afterAll(async () => {
  if (cleanup) await cleanup();
  if (pool) await pool.end();
});

beforeEach(() => {
  setRngSeed(424242);
});

describe("golden run-view", () => {
  test("produces deterministic RunView output", async () => {
    const port = process.env.PORT ?? "3001";

    // 1. Create Intent
    const intentRes = await fetch(`http://127.0.0.1:${port}/intents`, {
      method: "POST",
      body: JSON.stringify({
        goal: "test goal",
        inputs: {},
        constraints: {},
        connectors: []
      })
    });
    const intentJson = (await intentRes.json()) as { intentId: string };
    const intentId = intentJson.intentId;

    // 1.5 Push mock responses
    daemon.pushResponse({
      info: {
        id: "msg-compile",
        structured_output: {
          goal: "test goal",
          design: ["test plan"],
          files: ["f1.ts"],
          risks: ["r1"],
          tests: ["test 1"]
        }
      },
      usage: { total_tokens: 100 }
    });
    daemon.pushResponse({
      info: {
        id: "msg-decide",
        structured_output: {
          patch: [{ path: "f1.ts", diff: "diff1" }],
          tests: ["test 1"],
          test_command: "ls"
        }
      },
      usage: { total_tokens: 200 }
    });

    // 2. Run Intent
    const runRes = await fetch(`http://127.0.0.1:${port}/intents/${intentId}/run`, {
      method: "POST",
      body: JSON.stringify({ traceId: "test-trace", queuePartitionKey: "golden-tenant" })
    });
    const runJson = (await runRes.json()) as {
      runId?: string;
      workflowId?: string;
      workflowID?: string;
    };
    const runId = runJson.runId;
    const workflowId = runJson.workflowId ?? runJson.workflowID;
    if (!runId || !workflowId) {
      throw new Error(`run response missing run/workflow ids: ${JSON.stringify(runJson)}`);
    }

    // 2.5 Wait for gate and approve
    let runView = await (await fetch(`http://127.0.0.1:${port}/runs/${runId}`)).json();
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      if (runView.nextAction === "APPROVE_PLAN" || runView.status === "succeeded") break;
      await new Promise((r) => setTimeout(r, 200));
      runView = await (await fetch(`http://127.0.0.1:${port}/runs/${runId}`)).json();
    }

    if (runView.nextAction === "APPROVE_PLAN") {
      const gateReadyBy = Date.now() + 10000;
      let gateKey: string | null = null;
      while (Date.now() < gateReadyBy) {
        const gatesRes = await fetch(`http://127.0.0.1:${port}/api/runs/${workflowId}/gates`);
        if (gatesRes.ok) {
          const gates = (await gatesRes.json()) as Array<{ gateKey?: string }>;
          if (Array.isArray(gates) && gates.length > 0 && gates[0]?.gateKey) {
            gateKey = gates[0].gateKey;
            break;
          }
        }
        await new Promise((r) => setTimeout(r, 200));
      }
      if (!gateKey) {
        throw new Error(`gate not found for workflow ${workflowId}`);
      }

      const approveRes = await fetch(
        `http://127.0.0.1:${port}/api/runs/${workflowId}/gates/${gateKey}/reply`,
        {
          method: "POST",
          body: JSON.stringify({
            payload: { choice: "yes", rationale: "golden-test" },
            dedupeKey: `golden-${workflowId}`
          }),
          headers: { "content-type": "application/json" }
        }
      );
      expect(approveRes.status).toBe(200);
    }

    // 3. Wait for completion
    const completeBy = Date.now() + 20000;
    while (Date.now() < completeBy) {
      runView = await (await fetch(`http://127.0.0.1:${port}/runs/${runId}`)).json();
      if (runView.status === "succeeded") break;
      await new Promise((r) => setTimeout(r, 200));
    }
    expect(runView.status).toBe("succeeded");

    // 4. Fetch RunView
    const viewRes = await fetch(`http://127.0.0.1:${port}/runs/${runId}`, {
      method: "GET"
    });
    runView = await viewRes.json();

    // 5. Normalize
    const normalized = normalizeForSnapshot(JSON.stringify(runView, null, 2));

    // 6. Compare with golden
    const goldenPath = path.join(__dirname, "../golden/run-view.json");

    // Ensure golden dir exists
    await fs.mkdir(path.dirname(goldenPath), { recursive: true });

    if (process.env.REFRESH_GOLDEN === "1") {
      await fs.writeFile(goldenPath, normalized);
    }

    if (!(await fs.stat(goldenPath).catch(() => null))) {
      throw new Error(
        `Golden baseline missing at ${goldenPath}. Run with REFRESH_GOLDEN=1 to create it.`
      );
    }

    const golden = await fs.readFile(goldenPath, "utf-8");

    // Use toEqual for better error diff if it fails
    expect(normalized).toBe(golden);
  }, 60000);
});
