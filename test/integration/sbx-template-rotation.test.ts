import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import type { Pool } from "pg";
import { closePool, createPool } from "../../src/db/pool";
import { insertIntent } from "../../src/db/intentRepo";
import { insertRun } from "../../src/db/runRepo";
import { findSbxTemplateByKey, insertSbxTemplate } from "../../src/db/sbxTemplateRepo";
import { resolveSbxTemplateSelection } from "../../src/sbx/template-resolver";

describe("sbx template rotation", () => {
  let pool: Pool;

  beforeAll(() => {
    pool = createPool();
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

  test("resolver is deterministic and registry rows are immutable by deps hash", async () => {
    const intentId = "it_sbx_tpl_rot";
    const runId = "run_sbx_tpl_rot";
    const workflowId = "ih_sbx_tpl_rot";
    const recipeId = "rcp-template";
    const recipeV = "1.0.0";
    const depsHashA = "deps_a";
    const depsHashB = "deps_b";

    await insertIntent(pool, intentId, {
      goal: "template rotation",
      inputs: {},
      constraints: {}
    });
    await insertRun(pool, {
      id: runId,
      intent_id: intentId,
      intent_hash: workflowId.slice(3),
      recipe_id: recipeId,
      recipe_v: recipeV,
      recipe_hash: depsHashA,
      workflow_id: workflowId,
      status: "queued",
      trace_id: undefined,
      tenant_id: undefined,
      queue_partition_key: "tenant-a"
    });

    const cold = await resolveSbxTemplateSelection(pool, runId, "local-node-24");
    expect(cold.source).toBe("cold");
    expect(cold.templateKey).toBe(`${recipeId}:${recipeV}:${depsHashA}`);

    const rowA = await insertSbxTemplate(
      pool,
      { recipeId, recipeV, depsHash: depsHashA },
      { templateKey: `${recipeId}:${recipeV}:${depsHashA}`, templateId: "tpl_A" }
    );
    const hotA = await resolveSbxTemplateSelection(pool, runId, "local-node-24");
    expect(hotA).toMatchObject({
      source: "hot",
      templateId: "tpl_A",
      templateKey: `${recipeId}:${recipeV}:${depsHashA}`,
      depsHash: depsHashA
    });

    const rowAAgain = await insertSbxTemplate(
      pool,
      { recipeId, recipeV, depsHash: depsHashA },
      { templateKey: `${recipeId}:${recipeV}:${depsHashA}`, templateId: "tpl_A" }
    );
    expect(rowAAgain.template_id).toBe(rowA.template_id);

    await expect(
      insertSbxTemplate(
        pool,
        { recipeId, recipeV, depsHash: depsHashA },
        { templateKey: `${recipeId}:${recipeV}:${depsHashA}`, templateId: "tpl_A_drift" }
      )
    ).rejects.toThrow(/sbx template drift/);

    await insertSbxTemplate(
      pool,
      { recipeId, recipeV, depsHash: depsHashB },
      { templateKey: `${recipeId}:${recipeV}:${depsHashB}`, templateId: "tpl_B" }
    );
    const rowB = await findSbxTemplateByKey(pool, { recipeId, recipeV, depsHash: depsHashB });
    expect(rowB?.template_id).toBe("tpl_B");

    const count = await pool.query<{ c: number }>(
      "SELECT COUNT(*)::int AS c FROM app.sbx_templates WHERE recipe_id=$1 AND recipe_v=$2",
      [recipeId, recipeV]
    );
    expect(count.rows[0]?.c).toBe(2);
  });
});
