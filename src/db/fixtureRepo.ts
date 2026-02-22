import type { Pool, PoolClient } from "pg";
import { canonicalStringify } from "../lib/hash";
import type { RecipeFixture } from "../contracts/recipe.schema";

type DBConn = Pool | PoolClient;

export type RecipeFixtureRow = {
  recipe_id: string;
  v: string;
  fixture_id: string;
  json: RecipeFixture;
  created_at: Date;
};

export async function insertRecipeFixtures(
  conn: DBConn,
  recipeId: string,
  v: string,
  fixtures: RecipeFixture[]
): Promise<void> {
  const ordered = [...fixtures].sort((a, b) => a.id.localeCompare(b.id));
  for (const fixture of ordered) {
    const canonical = JSON.parse(canonicalStringify(fixture));
    await conn.query(
      `INSERT INTO app.recipe_fixtures (recipe_id, v, fixture_id, json)
       VALUES ($1, $2, $3, $4::jsonb)
       ON CONFLICT (recipe_id, v, fixture_id) DO NOTHING`,
      [recipeId, v, fixture.id, JSON.stringify(canonical)]
    );
    const existing = await conn.query<RecipeFixtureRow>(
      `SELECT recipe_id, v, fixture_id, json, created_at
       FROM app.recipe_fixtures
       WHERE recipe_id = $1 AND v = $2 AND fixture_id = $3`,
      [recipeId, v, fixture.id]
    );
    const row = existing.rows[0];
    if (!row) {
      throw new Error(`fixture insert conflict but missing row: ${recipeId}@${v}:${fixture.id}`);
    }
    if (canonicalStringify(row.json) !== canonicalStringify(canonical)) {
      throw new Error(`fixture divergence: ${recipeId}@${v}:${fixture.id}`);
    }
  }
}

export async function listRecipeFixtures(
  pool: Pool,
  recipeRef: { id: string; v: string }
): Promise<RecipeFixtureRow[]> {
  const out = await pool.query<RecipeFixtureRow>(
    `SELECT recipe_id, v, fixture_id, json, created_at
     FROM app.recipe_fixtures
     WHERE recipe_id = $1 AND v = $2
     ORDER BY fixture_id ASC`,
    [recipeRef.id, recipeRef.v]
  );
  return out.rows;
}
