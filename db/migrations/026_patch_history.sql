CREATE TABLE IF NOT EXISTS app.patch_history (
  run_id TEXT NOT NULL,
  step_id TEXT NOT NULL,
  patch_index INTEGER NOT NULL,
  target_path TEXT NOT NULL,
  preimage_hash TEXT NOT NULL,
  postimage_hash TEXT NOT NULL,
  diff_hash TEXT NOT NULL,
  preimage_content TEXT NOT NULL,
  postimage_content TEXT NOT NULL,
  applied_at TIMESTAMPTZ,
  rolled_back_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (run_id, step_id, patch_index)
);
