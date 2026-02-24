import type { Pool, PoolClient } from "pg";
import { canonicalStringify, sha256 } from "../lib/hash";
import type { RecipeBundle, RecipeSpec } from "../contracts/recipe.schema";
import { insertRecipeFixtures, listRecipeFixtures } from "./fixtureRepo";

export type RecipeRow = {
  id: string;
  name: string;
  version: number;
  queue_name: "compileQ" | "sbxQ" | "controlQ" | "intentQ";
  max_concurrency: number;
  max_steps: number;
  max_sandbox_minutes: number;
  spec: Record<string, unknown>;
  created_at: Date;
};

export async function findRecipeByName(
  pool: Pool,
  name: string,
  version?: number
): Promise<RecipeRow | undefined> {
  if (version !== undefined) {
    const exact = await pool.query<RecipeRow>(
      `SELECT id, name, version, queue_name, max_concurrency, max_steps, max_sandbox_minutes, spec, created_at
       FROM app.recipes
       WHERE name = $1 AND version = $2`,
      [name, version]
    );
    if ((exact.rowCount ?? 0) > 0) return exact.rows[0];
    return undefined;
  }

  const latest = await pool.query<RecipeRow>(
    `SELECT id, name, version, queue_name, max_concurrency, max_steps, max_sandbox_minutes, spec, created_at
     FROM app.recipes
     WHERE name = $1
     ORDER BY version DESC
     LIMIT 1`,
    [name]
  );

  if ((latest.rowCount ?? 0) > 0) return latest.rows[0];
  return undefined;
}

export type RecipeVersionRow = {
  id: string;
  v: string;
  hash: string;
  status: "draft" | "candidate" | "stable";
  json: RecipeSpec;
  created_at: Date;
};

type DBConn = Pool | PoolClient;

export async function insertVersion(
  conn: DBConn,
  recipe: RecipeSpec,
  status: RecipeVersionRow["status"] = "draft"
): Promise<RecipeVersionRow> {
  const canonical = canonicalStringify(recipe);
  const hash = sha256(canonical);
  const parsed = JSON.parse(canonical);

  const stableExists = await conn.query<{ exists: boolean }>(
    `SELECT EXISTS(
       SELECT 1
       FROM app.recipe_versions
       WHERE id = $1 AND v = $2 AND status = 'stable'
     ) AS exists`,
    [recipe.id, recipe.v]
  );
  if (stableExists.rows[0]?.exists) {
    throw new Error(`stable recipe version is immutable: ${recipe.id}@${recipe.v}`);
  }

  await conn.query(
    `INSERT INTO app.recipe_versions (id, v, hash, status, json)
     VALUES ($1, $2, $3, $4, $5::jsonb)
     ON CONFLICT (id, v) DO NOTHING`,
    [recipe.id, recipe.v, hash, status, JSON.stringify(parsed)]
  );
  await insertRecipeFixtures(conn, recipe.id, recipe.v, recipe.fixtures);

  const row = await conn.query<RecipeVersionRow>(
    `SELECT id, v, hash, status, json, created_at
     FROM app.recipe_versions
     WHERE id = $1 AND v = $2`,
    [recipe.id, recipe.v]
  );
  if ((row.rowCount ?? 0) === 0) {
    throw new Error(`failed to persist recipe version: ${recipe.id}@${recipe.v}`);
  }

  if (row.rows[0].hash !== hash) {
    throw new Error(`recipe hash mismatch for ${recipe.id}@${recipe.v}`);
  }

  return row.rows[0];
}

export async function setCandidate(pool: Pool, id: string, v: string): Promise<boolean> {
  const updated = await pool.query(
    `UPDATE app.recipe_versions
     SET status = 'candidate'
     WHERE id = $1 AND v = $2 AND status = 'draft'`,
    [id, v]
  );
  return (updated.rowCount ?? 0) === 1;
}

export async function promoteStable(pool: Pool, id: string, v: string): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const promote = await client.query(
      `UPDATE app.recipe_versions
       SET status = 'stable'
       WHERE id = $1 AND v = $2 AND status = 'candidate'`,
      [id, v]
    );
    if ((promote.rowCount ?? 0) !== 1) {
      await client.query("ROLLBACK");
      return false;
    }

    const coverage = await client.query<{ eval_count: number; fixture_count: number }>(
      `SELECT
         jsonb_array_length(COALESCE(rv.json->'eval','[]'::jsonb))::int AS eval_count,
         (
           SELECT COUNT(*)::int
           FROM app.recipe_fixtures rf
           WHERE rf.recipe_id = rv.id AND rf.v = rv.v
         ) AS fixture_count
       FROM app.recipe_versions rv
       WHERE rv.id = $1 AND rv.v = $2`,
      [id, v]
    );
    if ((coverage.rowCount ?? 0) !== 1) {
      await client.query("ROLLBACK");
      return false;
    }
    const evalCount = coverage.rows[0].eval_count;
    const fixtureCount = coverage.rows[0].fixture_count;
    if (evalCount < 1 || fixtureCount < 1) {
      await client.query("ROLLBACK");
      return false;
    }

    await client.query(
      `INSERT INTO app.recipes (id, name, version, queue_name, max_concurrency, max_steps, max_sandbox_minutes, spec, active_v)
       VALUES ($1, $2, 1, 'intentQ', 10, 32, 15, '{}'::jsonb, $3)
       ON CONFLICT (id) DO UPDATE SET active_v = EXCLUDED.active_v`,
      [id, id, v]
    );

    await client.query("COMMIT");
    return true;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function findStable(pool: Pool, id: string): Promise<RecipeVersionRow | undefined> {
  const row = await pool.query<RecipeVersionRow>(
    `SELECT rv.id, rv.v, rv.hash, rv.status, rv.json, rv.created_at
     FROM app.recipe_versions rv
     JOIN app.recipes r ON r.id = rv.id AND r.active_v = rv.v
     WHERE rv.id = $1 AND rv.status = 'stable'
     LIMIT 1`,
    [id]
  );
  return row.rows[0];
}

export async function findVersion(
  pool: Pool,
  recipeRef: { id: string; v: string }
): Promise<RecipeVersionRow | undefined> {
  const row = await pool.query<RecipeVersionRow>(
    `SELECT id, v, hash, status, json, created_at
     FROM app.recipe_versions
     WHERE id = $1 AND v = $2
     LIMIT 1`,
    [recipeRef.id, recipeRef.v]
  );
  return row.rows[0];
}

export async function canPromoteStable(pool: Pool, id: string, v: string): Promise<boolean> {
  const [version, fixtures] = await Promise.all([
    findVersion(pool, { id, v }),
    listRecipeFixtures(pool, { id, v })
  ]);
  if (!version || version.status !== "candidate") return false;
  const evalCount = Array.isArray(version.json.eval) ? version.json.eval.length : 0;
  return evalCount >= 1 && fixtures.length >= 1;
}

export async function importBundle(pool: Pool, bundle: RecipeBundle): Promise<RecipeVersionRow[]> {
  const out: RecipeVersionRow[] = [];
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const version of bundle.versions) {
      const inserted = await insertVersion(client, version, "draft");
      out.push(inserted);
    }
    await client.query("COMMIT");
    return out.sort((a, b) => a.v.localeCompare(b.v));
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function exportBundle(pool: Pool, id: string): Promise<RecipeBundle> {
  const rows = await pool.query<RecipeVersionRow>(
    `SELECT id, v, hash, status, json, created_at
     FROM app.recipe_versions
     WHERE id = $1
     ORDER BY v ASC`,
    [id]
  );
  return {
    id,
    versions: rows.rows.map((row) => row.json)
  };
}
