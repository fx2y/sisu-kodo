INSERT INTO app.workflow_runs (workflow_id, step1_done, step2_done, completed)
VALUES ('seed_sentinel', TRUE, TRUE, TRUE)
ON CONFLICT (workflow_id) DO NOTHING;

INSERT INTO app.marks (run_id, step)
VALUES ('seed_sentinel', 's1'), ('seed_sentinel', 's2')
ON CONFLICT (run_id, step) DO NOTHING;
