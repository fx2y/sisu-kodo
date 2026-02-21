-- Migration 019: Human Interactions Uplift
-- Adds missing fields for interaction traceability.

ALTER TABLE app.human_interactions ADD COLUMN IF NOT EXISTS run_id TEXT REFERENCES app.runs(id);
ALTER TABLE app.human_interactions ADD COLUMN IF NOT EXISTS origin TEXT;

-- Update unique constraint to include topic if needed
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'human_interactions_workflow_id_gate_key_topic_dedupe_key_key') THEN
        ALTER TABLE app.human_interactions DROP CONSTRAINT IF EXISTS human_interactions_workflow_id_gate_key_dedupe_key_key;
        ALTER TABLE app.human_interactions ADD CONSTRAINT human_interactions_workflow_id_gate_key_topic_dedupe_key_key UNIQUE (workflow_id, gate_key, topic, dedupe_key);
    END IF;
END $$;
