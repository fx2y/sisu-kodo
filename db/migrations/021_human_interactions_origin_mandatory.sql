-- Migration 021: Human Interactions Origin Mandatory
-- Backfills NULL origin values and makes the column NOT NULL.

UPDATE app.human_interactions SET origin = 'unknown' WHERE origin IS NULL;

ALTER TABLE app.human_interactions ALTER COLUMN origin SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM pg_constraint
         WHERE conname = 'origin_check'
    ) THEN
        ALTER TABLE app.human_interactions
          ADD CONSTRAINT origin_check
          CHECK (origin IN ('manual', 'engine-dbos', 'api-shim', 'webhook', 'webhook-ci', 'external', 'unknown'));
    END IF;
END $$;
