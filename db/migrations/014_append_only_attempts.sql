DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='app' AND table_name='sbx_runs' AND column_name='attempt') THEN
        ALTER TABLE app.sbx_runs ADD COLUMN attempt INT NOT NULL DEFAULT 1;
        ALTER TABLE app.sbx_runs DROP CONSTRAINT sbx_runs_pkey;
        ALTER TABLE app.sbx_runs ADD PRIMARY KEY (run_id, step_id, task_key, attempt);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='app' AND table_name='artifacts' AND column_name='attempt') THEN
        ALTER TABLE app.artifacts ADD COLUMN attempt INT NOT NULL DEFAULT 1;
        ALTER TABLE app.artifacts DROP CONSTRAINT artifacts_pkey;
        ALTER TABLE app.artifacts ADD PRIMARY KEY (run_id, step_id, task_key, idx, attempt);
    END IF;
END $$;
