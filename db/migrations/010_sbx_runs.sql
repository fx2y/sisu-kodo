CREATE TABLE IF NOT EXISTS app.sbx_runs (
    run_id TEXT NOT NULL REFERENCES app.runs(id),
    step_id TEXT NOT NULL,
    task_key TEXT NOT NULL,
    provider TEXT NOT NULL,
    request JSONB NOT NULL,
    response JSONB NOT NULL,
    err_code TEXT NOT NULL,
    metrics JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (run_id, step_id, task_key)
);

CREATE INDEX IF NOT EXISTS sbx_runs_task_key_idx ON app.sbx_runs(task_key);
