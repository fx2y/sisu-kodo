CREATE TABLE IF NOT EXISTS app.opencode_calls (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES app.runs(id),
  step_id TEXT NOT NULL,
  request JSONB NOT NULL,
  response JSONB NOT NULL,
  diff JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS opencode_calls_run_step_idx
  ON app.opencode_calls (run_id, step_id, created_at DESC);

CREATE TABLE IF NOT EXISTS app.mock_receipts (
  receipt_key TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES app.runs(id),
  step_id TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  first_attempt INT NOT NULL CHECK (first_attempt > 0),
  last_attempt INT NOT NULL CHECK (last_attempt > 0),
  seen_count INT NOT NULL DEFAULT 1 CHECK (seen_count > 0),
  request_payload JSONB NOT NULL,
  response_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS mock_receipts_run_idx
  ON app.mock_receipts (run_id, step_id);
