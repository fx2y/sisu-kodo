DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='app' AND table_name='run_steps' AND column_name='attempt') THEN
        ALTER TABLE app.run_steps ADD COLUMN attempt INT NOT NULL DEFAULT 1;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name='run_steps_pkey' AND table_schema='app' AND table_name='run_steps') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.key_column_usage WHERE constraint_name='run_steps_pkey' AND column_name='attempt') THEN
            ALTER TABLE app.run_steps DROP CONSTRAINT run_steps_pkey;
            ALTER TABLE app.run_steps ADD PRIMARY KEY (run_id, step_id, attempt);
        END IF;
    END IF;
END $$;
