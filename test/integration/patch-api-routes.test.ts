import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { DBOS } from "@dbos-inc/dbos-sdk";
import type { Pool } from "pg";
import { createPool } from "../../src/db/pool";
import { startApp } from "../../src/server/app";
import { DBOSWorkflowEngine } from "../../src/workflow/engine-dbos";
import { insertPatchHistory } from "../../src/db/patchHistoryRepo";
import { generateId } from "../../src/lib/id";

describe("patch history API routes", () => {
  let pool: Pool;
  let stop: (() => Promise<void>) | undefined;
  const port = 3006;
  const baseUrl = `http://127.0.0.1:${port}/api`;

  beforeAll(async () => {
    await DBOS.launch();
    pool = createPool();
    await pool.query("TRUNCATE app.intents, app.runs, app.patch_history CASCADE");
    const workflow = new DBOSWorkflowEngine(25);
    const app = await startApp(pool, workflow, port);
    stop = async () => {
      await new Promise<void>((resolve) => app.server.close(() => resolve()));
      await DBOS.shutdown();
    };
  });

  afterAll(async () => {
    if (stop) await stop();
    await pool.end();
  });

  test("GET /api/runs/[wid]/steps/[stepId]/patches returns history", async () => {
    const workflowId = `wf_patch_${Date.now()}`;
    const runId = generateId("rn");
    const intentId = `it_patch_${Date.now()}`;

    // Seed intent
    await pool.query(
      `INSERT INTO app.intents (id, goal, payload, json, intent_hash)
       VALUES ($1, 'goal', '{}'::jsonb, '{}'::jsonb, $2)`,
      [intentId, `hash_${Date.now()}`]
    );

    // Seed run
    await pool.query(
      `INSERT INTO app.runs (id, workflow_id, intent_id, status)
       VALUES ($1, $2, $3, 'running')`,
      [runId, workflowId, intentId]
    );

    // Seed patch history
    await insertPatchHistory(pool, {
      runId,
      stepId: "ApplyPatchST",
      patchIndex: 0,
      targetPath: "src/index.ts",
      preimageHash: "h1",
      postimageHash: "h2",
      diffHash: "d1",
      preimageContent: "v1",
      postimageContent: "v2"
    });

    const res = await fetch(`${baseUrl}/runs/${workflowId}/steps/ApplyPatchST/patches`);
    expect(res.status).toBe(200);
    const history = await res.json();
    expect(history).toHaveLength(1);
    expect(history[0].patchIndex).toBe(0);
    expect(history[0].targetPath).toBe("src/index.ts");
    expect(history[0].preimageHash).toBe("h1");
  });

  test("GET returns 404 for unknown run", async () => {
    const res = await fetch(`${baseUrl}/runs/wf_unknown/steps/ApplyPatchST/patches`);
    expect(res.status).toBe(404);
  });
});
