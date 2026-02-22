import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { DBOS } from "@dbos-inc/dbos-sdk";
import type { Pool } from "pg";
import { createPool } from "../../src/db/pool";
import { startApp } from "../../src/server/app";
import { DBOSWorkflowEngine } from "../../src/workflow/engine-dbos";

let pool: Pool;
let stop: (() => Promise<void>) | undefined;

async function seedStableRecipe(id: string, v: string): Promise<void> {
  const spec = {
    id,
    v,
    name: `${id} recipe`,
    tags: ["test"],
    formSchema: { type: "object", properties: { goal: { type: "string" } }, required: [] },
    intentTmpl: { goal: "{{formData.goal}}", inputs: {}, constraints: {} },
    wfEntry: "Runner.runIntent",
    queue: "intentQ",
    limits: { maxSteps: 10, maxFanout: 10, maxSbxMin: 10, maxTokens: 1024 },
    eval: [],
    fixtures: [],
    prompts: { compile: "x", postmortem: "y" }
  };
  await pool.query(
    `INSERT INTO app.recipe_versions (id, v, hash, status, json)
     VALUES ($1, $2, md5($3), 'stable', $4::jsonb)
     ON CONFLICT (id, v) DO NOTHING`,
    [id, v, JSON.stringify(spec), JSON.stringify(spec)]
  );
  await pool.query(
    `INSERT INTO app.recipes (id, name, version, queue_name, max_concurrency, max_steps, max_sandbox_minutes, spec, active_v)
     VALUES ($1, $1, 1, 'intentQ', 10, 32, 15, '{}'::jsonb, $2)
     ON CONFLICT (id) DO UPDATE SET active_v = EXCLUDED.active_v`,
    [id, v]
  );
}

beforeAll(async () => {
  await DBOS.launch();
  pool = createPool();
  await pool.query("ALTER TABLE app.runs ADD COLUMN IF NOT EXISTS budget JSONB");
  const app = await startApp(pool, new DBOSWorkflowEngine(20));
  stop = async () => {
    await new Promise<void>((resolve) => app.server.close(() => resolve()));
    await DBOS.shutdown();
  };
});

afterAll(async () => {
  if (stop) await stop();
  await pool.end();
});

describe("CY4 budget ingress", () => {
  test("POST /api/run rejects oversize budget/workload and writes zero runs", async () => {
    await seedStableRecipe("cy4-budget", "v1");
    const before = await pool.query("SELECT COUNT(*)::int AS n FROM app.runs");

    const res = await fetch(`http://127.0.0.1:${process.env.PORT ?? "3001"}/api/run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        recipeRef: { id: "cy4-budget", v: "v1" },
        formData: { goal: "x" },
        opts: {
          queuePartitionKey: "tenant-cy4",
          workload: { concurrency: 1, steps: 3, sandboxMinutes: 1 },
          budget: {
            maxFanout: 1,
            maxSBXMinutes: 5,
            maxArtifactsMB: 1,
            maxRetriesPerStep: 0,
            maxWallClockMS: 1000
          }
        }
      })
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(String(body.error ?? "")).toContain("budget:maxFanout");

    const after = await pool.query("SELECT COUNT(*)::int AS n FROM app.runs");
    expect(after.rows[0].n).toBe(before.rows[0].n);
  });
});
