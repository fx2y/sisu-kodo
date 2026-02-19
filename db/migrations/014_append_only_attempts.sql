ALTER TABLE app.sbx_runs ADD COLUMN attempt INT NOT NULL DEFAULT 1;
ALTER TABLE app.sbx_runs DROP CONSTRAINT sbx_runs_pkey;
ALTER TABLE app.sbx_runs ADD PRIMARY KEY (run_id, step_id, task_key, attempt);

ALTER TABLE app.artifacts ADD COLUMN attempt INT NOT NULL DEFAULT 1;
ALTER TABLE app.artifacts DROP CONSTRAINT artifacts_pkey;
ALTER TABLE app.artifacts ADD PRIMARY KEY (run_id, step_id, task_key, idx, attempt);
