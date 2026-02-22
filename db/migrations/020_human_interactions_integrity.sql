-- Migration 020: Human Interactions Integrity
-- Ensures payload_hash is a valid 64-hex string and tightens constraints.

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM pg_constraint
         WHERE conname = 'payload_hash_format_check'
    ) THEN
        ALTER TABLE app.human_interactions
          ADD CONSTRAINT payload_hash_format_check
          CHECK (payload_hash ~ '^[a-f0-9]{64}$');
    END IF;
END $$;

-- Note: We don't force run_id NOT NULL because utility/debug flows might not have it,
-- but our user-facing services already resolve it.
