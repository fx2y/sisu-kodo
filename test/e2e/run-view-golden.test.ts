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
import { normalizeForSnapshot } from "../../src/lib/normalize";
import { OCMockDaemon } from "../oc-mock-daemon";
import { setRngSeed } from "../../src/lib/rng";

let pool: Pool;
let daemon: OCMockDaemon;
let cleanup: () => Promise<void>;

beforeAll(async () => {
  await DBOS.launch();
  pool = createPool();
  const workflow = new DBOSWorkflowEngine(25);
  const app = await startApp(pool, workflow);
  
  daemon = new OCMockDaemon(daemonPort);
  await daemon.start();

  cleanup = async () => {
    await daemon.stop();
    await new Promise<void>((resolve) => app.server.close(() => resolve()));
    await DBOS.shutdown();
  };
});

afterAll(async () => {
  if (cleanup) await cleanup();
  if (pool) await pool.end();
});

beforeEach(() => {
  setRngSeed(Date.now() + process.pid);
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
          plan: ["test plan"],
          patch: [],
          tests: ["test 1"]
        }
      }
    });
    daemon.pushResponse({
      info: {
        id: "msg-decide",
        tool_calls: [{ name: "bash", arguments: { cmd: "ls" } }]
      }
    });

    // 2. Run Intent
    const runRes = await fetch(`http://127.0.0.1:${port}/intents/${intentId}/run`, {
      method: "POST",
      body: JSON.stringify({ traceId: "test-trace" })
    });
    const runJson = (await runRes.json()) as { runId: string; workflowId: string };
    const runId = runJson.runId;
    const workflowId = runJson.workflowId;

    // 3. Wait for completion
    const engine = new DBOSWorkflowEngine(25);
    await engine.waitUntilComplete(workflowId);

    // 4. Fetch RunView
    const viewRes = await fetch(`http://127.0.0.1:${port}/runs/${runId}`, {
      method: "GET"
    });
    const runView = await viewRes.json();

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
  });
});
