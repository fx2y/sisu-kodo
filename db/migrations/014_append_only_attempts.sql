DO $$
BEGIN
    -- Handle sbx_runs
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='app' AND table_name='sbx_runs' AND column_name='attempt') THEN
        ALTER TABLE app.sbx_runs ADD COLUMN attempt INT NOT NULL DEFAULT 1;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name='sbx_runs_pkey' AND table_schema='app' AND table_name='sbx_runs') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.key_column_usage WHERE constraint_name='sbx_runs_pkey' AND column_name='attempt') THEN
            ALTER TABLE app.sbx_runs DROP CONSTRAINT sbx_runs_pkey;
            ALTER TABLE app.sbx_runs ADD PRIMARY KEY (run_id, step_id, task_key, attempt);
        END IF;
    END IF;

    -- Handle artifacts
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='app' AND table_name='artifacts' AND column_name='attempt') THEN
        ALTER TABLE app.artifacts ADD COLUMN attempt INT NOT NULL DEFAULT 1;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name='artifacts_pkey' AND table_schema='app' AND table_name='artifacts') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.key_column_usage WHERE constraint_name='artifacts_pkey' AND column_name='attempt') THEN
            ALTER TABLE app.artifacts DROP CONSTRAINT artifacts_pkey;
            ALTER TABLE app.artifacts ADD PRIMARY KEY (run_id, step_id, task_key, idx, attempt);
        END IF;
    END IF;
END $$;
