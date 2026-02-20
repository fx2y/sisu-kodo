-- Migration 018: Human Gate + Interaction Ledger
-- Ensures durable gate correlation and exactly-once interaction semantics.

CREATE TABLE IF NOT EXISTS app.human_gates (
    run_id TEXT NOT NULL REFERENCES app.runs(id),
    gate_key TEXT NOT NULL,
    topic TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (run_id, gate_key)
);

CREATE TABLE IF NOT EXISTS app.human_interactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id TEXT NOT NULL,
    gate_key TEXT NOT NULL,
    topic TEXT NOT NULL,
    dedupe_key TEXT NOT NULL,
    payload_hash TEXT NOT NULL,
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (workflow_id, gate_key, dedupe_key)
);

CREATE INDEX IF NOT EXISTS idx_human_interactions_workflow_id ON app.human_interactions(workflow_id);
CREATE INDEX IF NOT EXISTS idx_human_interactions_gate_key ON app.human_interactions(gate_key);
