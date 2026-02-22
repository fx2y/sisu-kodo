CREATE TABLE IF NOT EXISTS app.recipe_fixtures (
  recipe_id TEXT NOT NULL,
  v TEXT NOT NULL,
  fixture_id TEXT NOT NULL,
  json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (recipe_id, v, fixture_id)
);

CREATE TABLE IF NOT EXISTS app.eval_results (
  run_id TEXT NOT NULL,
  check_id TEXT NOT NULL,
  pass BOOLEAN NOT NULL,
  reason TEXT NOT NULL,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (run_id, check_id)
);
