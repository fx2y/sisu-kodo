-- Add unique constraint to op_key to enforce exactly-once in the database
ALTER TABLE app.opencode_calls
  DROP CONSTRAINT IF EXISTS opencode_calls_op_key_unique;

ALTER TABLE app.opencode_calls
  ADD CONSTRAINT opencode_calls_op_key_unique UNIQUE (op_key);
