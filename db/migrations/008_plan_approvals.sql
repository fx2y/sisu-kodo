-- Additive migration for plan approvals
CREATE TABLE IF NOT EXISTS app.plan_approvals (
    run_id TEXT PRIMARY KEY REFERENCES app.runs(id),
    approved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    approved_by TEXT NOT NULL DEFAULT 'system',
    notes TEXT
);
