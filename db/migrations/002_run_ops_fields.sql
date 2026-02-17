-- Additive migration to persist recovery diagnostics in app.runs
ALTER TABLE app.runs ADD COLUMN IF NOT EXISTS last_step TEXT;
ALTER TABLE app.runs ADD COLUMN IF NOT EXISTS error TEXT;
ALTER TABLE app.runs ADD COLUMN IF NOT EXISTS retry_count INT NOT NULL DEFAULT 0;
ALTER TABLE app.runs ADD COLUMN IF NOT EXISTS next_action TEXT;
