import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import type { Pool } from "pg";
import { startApp, type AppHandle } from "../../src/server/app";
import { setupLifecycle, teardownLifecycle, type TestLifecycle } from "./lifecycle";
import { OCMockDaemon } from "../oc-mock-daemon";
import { reserveTestPorts } from "../helpers/test-ports";
import { closePool } from "../../src/db/pool";
import { generateId } from "../../src/lib/id";
import { insertVersion, promoteStable, setCandidate } from "../../src/db/recipeRepo";

type RunView = { status: string };

let lc: TestLifecycle;
let app: AppHandle;
let daemon: OCMockDaemon;
let appPort = 3001;
let adminPort = 3002;
let ocPort = 4096;
const patchDir = resolve(".tmp", "wf-patch-chain");
const patchFileRel = ".tmp/wf-patch-chain/recipe.json";
const patchFileAbs = resolve(patchFileRel);

async function waitForStatus(runId: string, expected: string, timeoutMs = 20_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await fetch(`http://127.0.0.1:${appPort}/runs/${runId}`);
    const body = (await res.json()) as RunView;
    if (body.status === expected) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 200));
  }
  throw new Error(`Timed out waiting for run ${runId} status=${expected}`);
}

async function waitForGateKey(workflowId: string, timeoutMs = 20_000): Promise<string> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const gatesRes = await fetch(`http://127.0.0.1:${appPort}/api/runs/${workflowId}/gates`);
    const gates = (await gatesRes.json()) as { gateKey: string }[];
    const gateKey = gates[0]?.gateKey;
    if (typeof gateKey === "string" && gateKey.length > 0) {
      return gateKey;
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 200));
  }
  throw new Error(`Timed out waiting for gate for ${workflowId}`);
}

beforeAll(async () => {
  ({ appPort, adminPort, ocPort } = await reserveTestPorts());
  process.env.PORT = String(appPort);
  process.env.ADMIN_PORT = String(adminPort);
  process.env.OC_MODE = "live";
  process.env.OC_SERVER_PORT = String(ocPort);
  process.env.OC_BASE_URL = `http://127.0.0.1:${ocPort}`;

  mkdirSync(patchDir, { recursive: true });
  writeFileSync(patchFileAbs, '{"id":"demo","v":"1.0.0"}\n', "utf8");

  lc = await setupLifecycle(20);
  daemon = new OCMockDaemon(ocPort);
  await daemon.start();
  app = await startApp(lc.pool, lc.workflow);

  await lc.pool.query(
    "TRUNCATE app.intents, app.runs, app.run_steps, app.artifacts, app.human_gates, app.human_interactions, app.patch_history, app.plan_approvals CASCADE"
  );
});

afterAll(async () => {
  await new Promise<void>((resolveClose) => app.server.close(() => resolveClose()));
  await daemon.stop();
  await teardownLifecycle(lc);
  await closePool();
  rmSync(patchDir, { recursive: true, force: true });
});

describe("workflow patch apply/rollback chain", () => {
  test("ApplyPatchST writes ledger, rejects on no, rolls back preimage, publish guard stays fail-closed", async () => {
    daemon.pushResponse({
      info: {
        id: "msg-plan-patch-chain",
        structured_output: {
          goal: "patch chain",
          design: ["d1"],
          files: [patchFileRel],
          risks: ["r1"],
          tests: ["t1"],
          patchPlan: [
            {
              targetPath: patchFileRel,
              postimageContent: '{"id":"demo","v":"1.0.1"}\n',
              diffText: "@@ -1 +1 @@"
            }
          ]
        }
      }
    });

    const intentRes = await fetch(`http://127.0.0.1:${appPort}/intents`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ goal: "workflow patch chain", inputs: {}, constraints: {} })
    });
    const { intentId } = (await intentRes.json()) as { intentId: string };

    const runRes = await fetch(`http://127.0.0.1:${appPort}/intents/${intentId}/run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ queuePartitionKey: "patch-chain" })
    });
    const { runId } = (await runRes.json()) as { runId: string };

    await waitForStatus(runId, "waiting_input");
    expect(readFileSync(patchFileAbs, "utf8")).toBe('{"id":"demo","v":"1.0.1"}\n');

    const patchRow = await lc.pool.query<{
      applied_at: Date | null;
      rolled_back_at: Date | null;
    }>(
      "SELECT applied_at, rolled_back_at FROM app.patch_history WHERE run_id = $1 AND step_id = 'ApplyPatchST' AND patch_index = 0",
      [runId]
    );
    expect(patchRow.rowCount).toBe(1);
    expect(patchRow.rows[0].applied_at).not.toBeNull();
    expect(patchRow.rows[0].rolled_back_at).toBeNull();

    const artifacts = await lc.pool.query<{ c: string }>(
      "SELECT COUNT(*)::text AS c FROM app.artifacts WHERE run_id = $1 AND step_id = 'ApplyPatchST' AND kind = 'patch_apply'",
      [runId]
    );
    expect(Number(artifacts.rows[0]?.c ?? "0")).toBe(1);

    const gateKey = await waitForGateKey(intentId);

    const rejectRes = await fetch(
      `http://127.0.0.1:${appPort}/api/runs/${intentId}/gates/${gateKey}/reply`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          payload: { choice: "no", rationale: "reject patch" },
          dedupeKey: `reject-${intentId}`,
          origin: "manual"
        })
      }
    );
    expect(rejectRes.status).toBe(200);

    await waitForStatus(runId, "retries_exceeded");
    expect(readFileSync(patchFileAbs, "utf8")).toBe('{"id":"demo","v":"1.0.0"}\n');

    const rolledBack = await lc.pool.query<{ rolled_back_at: Date | null }>(
      "SELECT rolled_back_at FROM app.patch_history WHERE run_id = $1 AND step_id = 'ApplyPatchST' AND patch_index = 0",
      [runId]
    );
    expect(rolledBack.rows[0]?.rolled_back_at).not.toBeNull();

    const pool: Pool = lc.pool;
    const recipeId = generateId("recipe");
    await insertVersion(pool, {
      id: recipeId,
      v: "1.0.0",
      name: "publish-guard",
      formSchema: { type: "object" },
      intentTmpl: { goal: "x", inputs: {}, constraints: {} },
      wfEntry: "run-intent",
      queue: "intentQ",
      limits: { maxSteps: 8, maxFanout: 1, maxSbxMin: 1, maxTokens: 64 },
      eval: [],
      fixtures: [],
      prompts: { compile: "c", postmortem: "p" }
    });
    expect(await setCandidate(pool, recipeId, "1.0.0")).toBe(true);
    expect(await promoteStable(pool, recipeId, "1.0.0")).toBe(false);
  }, 60_000);
});
