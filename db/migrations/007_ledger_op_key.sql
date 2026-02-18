-- Add op_key for deterministic idempotency
ALTER TABLE app.opencode_calls
  ADD COLUMN IF NOT EXISTS op_key TEXT;

CREATE INDEX IF NOT EXISTS opencode_calls_op_key_idx
  ON app.opencode_calls (op_key);
