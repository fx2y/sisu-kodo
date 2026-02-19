-- Migration to add task_key to artifacts to support fan-out execution without artifact collisions.
ALTER TABLE app.artifacts ADD COLUMN IF NOT EXISTS task_key TEXT NOT NULL DEFAULT '';

-- Update PK to include task_key
ALTER TABLE app.artifacts DROP CONSTRAINT IF EXISTS artifacts_pkey;
ALTER TABLE app.artifacts ADD PRIMARY KEY (run_id, step_id, task_key, idx);
