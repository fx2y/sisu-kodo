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
);

CREATE UNIQUE INDEX IF NOT EXISTS sbx_templates_template_key_idx
  ON app.sbx_templates(template_key);

