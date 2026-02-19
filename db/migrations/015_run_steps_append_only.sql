ALTER TABLE app.run_steps ADD COLUMN attempt INT NOT NULL DEFAULT 1;
ALTER TABLE app.run_steps DROP CONSTRAINT run_steps_pkey;
ALTER TABLE app.run_steps ADD PRIMARY KEY (run_id, step_id, attempt);
