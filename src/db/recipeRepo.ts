import type { Pool } from "pg";

export type RecipeRow = {
  id: string;
  name: string;
  version: number;
  queue_name: "compileQ" | "sandboxQ" | "controlQ";
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
