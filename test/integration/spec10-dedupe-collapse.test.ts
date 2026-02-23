import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { DBOS } from "@dbos-inc/dbos-sdk";
import type { Pool } from "pg";
import { createPool } from "../../src/db/pool";
import { startApp } from "../../src/server/app";
import { DBOSWorkflowEngine } from "../../src/workflow/engine-dbos";

let pool: Pool;
let sysPool: Pool;
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
    limits: { maxSteps: 10, maxFanout: 1, maxSbxMin: 5, maxTokens: 1024 },
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
  process.env.INTENT_QUEUE_PARTITION = "false";
  await DBOS.launch();
  const { Pool: PgPool } = await import("pg");
  const { getConfig } = await import("../../src/config");
  pool = createPool();
  await pool.query("ALTER TABLE app.runs ADD COLUMN IF NOT EXISTS budget JSONB");
  sysPool = new PgPool({ connectionString: getConfig().systemDatabaseUrl });
  const app = await startApp(pool, new DBOSWorkflowEngine(20));
  stop = async () => {
    await new Promise<void>((resolve) => app.server.close(() => resolve()));
    await DBOS.shutdown();
  };
});

afterAll(async () => {
  if (stop) await stop();
  await pool.end();
  await sysPool.end();
});

describe("CY4 dedupe collapse", () => {
  test("100 concurrent identical /api/run requests collapse to one workflow", async () => {
    await seedStableRecipe("cy4-dedupe", "v1");
    const uniqueGoal = `same-${process.pid}-${process.env.PORT ?? "p"}`;
    const payload = {
      recipeRef: { id: "cy4-dedupe", v: "v1" },
      formData: { goal: uniqueGoal }
    };

    const responses = await Promise.all(
      Array.from({ length: 100 }, () =>
        fetch(`http://127.0.0.1:${process.env.PORT ?? "3001"}/api/run`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload)
        })
      )
    );
    expect(responses.every((r) => r.status === 202)).toBe(true);
    const bodies = await Promise.all(responses.map((r) => r.json()));
    const workflowIds = new Set(bodies.map((b) => b.workflowID));
    expect(workflowIds.size).toBe(1);
    const workflowId = bodies[0].workflowID as string;

    const appRuns = await pool.query(
      "SELECT COUNT(*)::int AS n FROM app.runs WHERE workflow_id = $1",
      [workflowId]
    );
    expect(appRuns.rows[0].n).toBe(1);

    const dbosRows = await sysPool.query(
      "SELECT COUNT(*)::int AS n FROM dbos.workflow_status WHERE workflow_uuid = $1",
      [workflowId]
    );
    expect(dbosRows.rows[0].n).toBe(1);
  });
});
