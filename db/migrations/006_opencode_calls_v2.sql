-- Additive migration for OpenCode Ledger v2
ALTER TABLE app.opencode_calls
  ADD COLUMN IF NOT EXISTS session_id TEXT,
  ADD COLUMN IF NOT EXISTS agent TEXT,
  ADD COLUMN IF NOT EXISTS schema_hash TEXT,
  ADD COLUMN IF NOT EXISTS prompt TEXT,
  ADD COLUMN IF NOT EXISTS structured JSONB,
  ADD COLUMN IF NOT EXISTS raw_response TEXT,
  ADD COLUMN IF NOT EXISTS tool_calls JSONB,
  ADD COLUMN IF NOT EXISTS duration_ms INT,
  ADD COLUMN IF NOT EXISTS error JSONB;

-- Index for session-based replay
CREATE INDEX IF NOT EXISTS opencode_calls_session_idx
  ON app.opencode_calls (session_id, created_at ASC);
