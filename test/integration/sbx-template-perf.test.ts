import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import type { Pool } from "pg";
import { closePool, createPool } from "../../src/db/pool";
import { insertIntent } from "../../src/db/intentRepo";
import { insertRun } from "../../src/db/runRepo";
import { insertSbxTemplate } from "../../src/db/sbxTemplateRepo";
import { ExecuteStepImpl } from "../../src/workflow/steps/execute.step";
import { SaveArtifactsStepImpl } from "../../src/workflow/steps/save-artifacts.step";

function p95(xs: number[]): number {
  const sorted = [...xs].sort((a, b) => a - b);
  const idx = Math.max(0, Math.ceil(sorted.length * 0.95) - 1);
  return sorted[idx] ?? 0;
}

async function seedRun(
  pool: Pool,
  params: { runId: string; workflowId: string; intentId: string; recipeHash: string }
) {
  await insertIntent(pool, params.intentId, {
    goal: "sbx template perf",
    inputs: {},
    constraints: {}
  });
  await insertRun(pool, {
    id: params.runId,
    intent_id: params.intentId,
    intent_hash: params.workflowId.slice(3),
    recipe_id: "rcp-perf",
    recipe_v: "1.0.0",
    recipe_hash: params.recipeHash,
    workflow_id: params.workflowId,
    status: "queued",
    trace_id: undefined,
    tenant_id: undefined,
    queue_partition_key: "tenant-perf"
  });
}

describe("sbx template perf evidence", () => {
  let pool: Pool;
  const execute = new ExecuteStepImpl();
  const saveArtifacts = new SaveArtifactsStepImpl();

  beforeAll(() => {
    pool = createPool();
    process.env.SBX_MODE = "mock";
  });

  afterAll(async () => {
    await pool.end();
    await closePool();
  });

  beforeEach(async () => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS app.sbx_templates (
        recipe_id TEXT NOT NULL,
        recipe_v TEXT NOT NULL,
        deps_hash TEXT NOT NULL,
        template_key TEXT NOT NULL,
        template_id TEXT NOT NULL,
        build_meta JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (recipe_id, recipe_v, deps_hash)
      )
    `);
    await pool.query(
      "TRUNCATE app.sbx_templates, app.sbx_runs, app.artifacts, app.run_steps, app.runs, app.intents CASCADE"
    );
  });

  test("hot template boot p95 is lower than cold and persisted as SQL-queryable artifacts", async () => {
    const hotDeps = "deps_hot";
    await insertSbxTemplate(
      pool,
      { recipeId: "rcp-perf", recipeV: "1.0.0", depsHash: hotDeps },
      { templateKey: `rcp-perf:1.0.0:${hotDeps}`, templateId: "tpl_perf_hot" }
    );

    const decision = {
      prompt: "",
      toolcalls: [],
      responses: [],
      diffs: [],
      structured: {
        patch: [],
        tests: [],
        test_command: "pnpm test"
      }
    };

    const hotRuns = ["hot1", "hot2", "hot3"];
    const coldRuns = ["cold1", "cold2", "cold3"];

    for (const suffix of hotRuns) {
      const runId = `run_${suffix}`;
      const workflowId = `ih_${suffix}`;
      const intentId = `it_${suffix}`;
      await seedRun(pool, { runId, workflowId, intentId, recipeHash: hotDeps });
      const [req] = await execute.buildTasks(decision as never, { intentId: workflowId, runId });
      const { result } = await execute.executeTask(req, { runId });
      await saveArtifacts.execute(runId, "ExecuteST", result, 1);
    }

    for (const suffix of coldRuns) {
      const runId = `run_${suffix}`;
      const workflowId = `ih_${suffix}`;
      const intentId = `it_${suffix}`;
      await seedRun(pool, { runId, workflowId, intentId, recipeHash: `deps_${suffix}` });
      const [req] = await execute.buildTasks(decision as never, { intentId: workflowId, runId });
      const { result } = await execute.executeTask(req, { runId });
      await saveArtifacts.execute(runId, "ExecuteST", result, 1);
    }

    const rows = await pool.query<{ boot_ms: number; source: string }>(
      `SELECT
         (inline->'json'->>'bootMs')::int AS boot_ms,
         inline->'json'->>'source' AS source
       FROM app.artifacts
       WHERE step_id = 'ExecuteST'
         AND kind = 'json_diagnostic'
         AND uri LIKE '%/sbx-boot.json'
       ORDER BY run_id ASC`
    );

    const hot = rows.rows.filter((r) => r.source === "hot").map((r) => r.boot_ms);
    const cold = rows.rows.filter((r) => r.source === "cold").map((r) => r.boot_ms);
    expect(hot.length).toBeGreaterThan(0);
    expect(cold.length).toBeGreaterThan(0);
    expect(p95(hot)).toBeLessThan(p95(cold));
  });
});
