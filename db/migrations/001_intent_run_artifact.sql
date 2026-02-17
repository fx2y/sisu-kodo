-- Additive migration for domain entities: intents, runs, and artifacts.
-- Preserves existing app.workflow_runs and app.marks for crash demo.

CREATE TABLE IF NOT EXISTS app.intents (
  id TEXT PRIMARY KEY,
  goal TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app.runs (
  id TEXT PRIMARY KEY,
  intent_id TEXT NOT NULL REFERENCES app.intents(id),
  workflow_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL,
  trace_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app.run_steps (
  run_id TEXT NOT NULL REFERENCES app.runs(id),
  step_id TEXT NOT NULL,
  phase TEXT NOT NULL,
  output JSONB,
  trace_id TEXT,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  PRIMARY KEY (run_id, step_id)
);

CREATE TABLE IF NOT EXISTS app.artifacts (
  run_id TEXT NOT NULL REFERENCES app.runs(id),
  step_id TEXT NOT NULL,
  idx INT NOT NULL,
  kind TEXT NOT NULL,
  uri TEXT,
  inline JSONB,
  sha256 TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (run_id, step_id, idx)
);
