import type { Pool } from "pg";

export type SbxTemplateKey = {
  recipeId: string;
  recipeV: string;
  depsHash: string;
};

export type SbxTemplateRow = {
  recipe_id: string;
  recipe_v: string;
  deps_hash: string;
  template_key: string;
  template_id: string;
  build_meta: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
};

export async function findSbxTemplateByKey(
  pool: Pool,
  key: SbxTemplateKey
): Promise<SbxTemplateRow | null> {
  const res = await pool.query<SbxTemplateRow>(
    `SELECT recipe_id, recipe_v, deps_hash, template_key, template_id, build_meta, created_at, updated_at
     FROM app.sbx_templates
     WHERE recipe_id = $1 AND recipe_v = $2 AND deps_hash = $3`,
    [key.recipeId, key.recipeV, key.depsHash]
  );
  return res.rows[0] ?? null;
}

export async function insertSbxTemplate(
  pool: Pool,
  key: SbxTemplateKey,
  value: { templateKey: string; templateId: string; buildMeta?: Record<string, unknown> }
): Promise<SbxTemplateRow> {
  const res = await pool.query<SbxTemplateRow>(
    `INSERT INTO app.sbx_templates (recipe_id, recipe_v, deps_hash, template_key, template_id, build_meta)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)
     ON CONFLICT (recipe_id, recipe_v, deps_hash) DO NOTHING
     RETURNING recipe_id, recipe_v, deps_hash, template_key, template_id, build_meta, created_at, updated_at`,
    [
      key.recipeId,
      key.recipeV,
      key.depsHash,
      value.templateKey,
      value.templateId,
      JSON.stringify(value.buildMeta ?? {})
    ]
  );
  if (res.rowCount && res.rows[0]) {
    return res.rows[0];
  }

  const existing = await findSbxTemplateByKey(pool, key);
  if (!existing) {
    throw new Error(
      `sbx template conflict without row: ${key.recipeId}@${key.recipeV}:${key.depsHash}`
    );
  }
  if (existing.template_key !== value.templateKey || existing.template_id !== value.templateId) {
    throw new Error(
      `sbx template drift ${key.recipeId}@${key.recipeV}:${key.depsHash} (${existing.template_key}/${existing.template_id} != ${value.templateKey}/${value.templateId})`
    );
  }
  return existing;
}
