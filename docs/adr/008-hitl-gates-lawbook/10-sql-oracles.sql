-- ADR-008 SQL Oracle Pack
-- Zero rows expected in every query below unless noted.

-- 1) run_steps exactly-once
SELECT run_id, step_id, attempt, COUNT(*) c
FROM app.run_steps
GROUP BY run_id, step_id, attempt
HAVING COUNT(*) > 1;

-- 2) artifacts exactly-once (task_key mandatory dimension)
SELECT run_id, step_id, task_key, attempt, idx, COUNT(*) c
FROM app.artifacts
GROUP BY run_id, step_id, task_key, attempt, idx
HAVING COUNT(*) > 1;

-- 3) interaction ledger x-once
SELECT workflow_id, gate_key, topic, dedupe_key, COUNT(*) c
FROM app.human_interactions
GROUP BY workflow_id, gate_key, topic, dedupe_key
HAVING COUNT(*) > 1;

-- 4) decision event uniqueness
SELECT workflow_uuid, key, COUNT(*) c
FROM dbos.workflow_events
WHERE key LIKE 'decision:%'
GROUP BY workflow_uuid, key
HAVING COUNT(*) > 1;

-- 5) no-phantom prompt (ui prompt emitted once per gate)
SELECT workflow_uuid, key, COUNT(*) c
FROM dbos.workflow_events
WHERE key LIKE 'ui:%'
  AND key NOT LIKE '%:result'
  AND key NOT LIKE '%:audit'
GROUP BY workflow_uuid, key
HAVING COUNT(*) > 1;

-- 6) escalation idempotence
SELECT workflow_uuid, COUNT(*) c
FROM dbos.workflow_status
WHERE workflow_uuid LIKE 'esc:%'
GROUP BY workflow_uuid
HAVING COUNT(*) > 1;

-- 7) hash/origin/run_id hygiene
SELECT COUNT(*) AS bad_hash
FROM app.human_interactions
WHERE payload_hash !~ '^[a-f0-9]{64}$';

SELECT COUNT(*) AS null_origin
FROM app.human_interactions
WHERE origin IS NULL OR btrim(origin) = '';

SELECT COUNT(*) AS null_run_id
FROM app.human_interactions
WHERE run_id IS NULL;
