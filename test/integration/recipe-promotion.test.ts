import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Pool } from "pg";
import { closePool, createPool } from "../../src/db/pool";
import { insertVersion, promoteStable, setCandidate } from "../../src/db/recipeRepo";

function mkRecipe(id: string, v: string, withEval = true) {
  return {
    id,
    v,
    name: `${id}@${v}`,
    formSchema: { type: "object", additionalProperties: false, properties: {} },
    intentTmpl: { goal: "x" },
    wfEntry: "Runner.runIntent",
    queue: "intentQ" as const,
    limits: { maxSteps: 5, maxFanout: 2, maxSbxMin: 1, maxTokens: 256 },
    eval: withEval ? [{ id: "exists", kind: "file_exists" as const, glob: "artifact://*" }] : [],
    fixtures: [{ id: "fx1", formData: { x: 1 } }],
    prompts: { compile: "c", postmortem: "p" }
  };
}

describe("recipe promotion", () => {
  let pool: Pool;

  beforeAll(() => {
    pool = createPool();
  });

  afterAll(async () => {
    await pool.end();
    await closePool();
  });

  test("candidate with eval+fixtures promotes atomically", async () => {
    const id = `rcp_promote_${Date.now()}`;
    const v = "1.0.0";
    await insertVersion(pool, mkRecipe(id, v, true), "draft");
    expect(await setCandidate(pool, id, v)).toBe(true);
    expect(await promoteStable(pool, id, v)).toBe(true);

    const check = await pool.query<{ status: string; active_v: string }>(
      `SELECT rv.status, r.active_v
       FROM app.recipe_versions rv
       JOIN app.recipes r ON r.id = rv.id
       WHERE rv.id = $1 AND rv.v = $2`,
      [id, v]
    );
    expect(check.rows[0].status).toBe("stable");
    expect(check.rows[0].active_v).toBe(v);
  });

  test("candidate without eval does not promote", async () => {
    const id = `rcp_nopromote_${Date.now()}`;
    const v = "1.0.0";
    await insertVersion(pool, mkRecipe(id, v, false), "draft");
    expect(await setCandidate(pool, id, v)).toBe(true);
    expect(await promoteStable(pool, id, v)).toBe(false);

    const check = await pool.query<{ status: string }>(
      `SELECT status FROM app.recipe_versions WHERE id = $1 AND v = $2`,
      [id, v]
    );
    expect(check.rows[0].status).toBe("candidate");
  });
});
