-- Migration 017: Ops Views
-- Read-only views over dbos system tables for operator ergonomics.

-- Recent Failures (Last 24h)
CREATE OR REPLACE VIEW app.v_ops_failures_24h AS
SELECT 
    workflow_uuid,
    status,
    name as workflow_name,
    class_name,
    application_version,
    created_at,
    updated_at,
    error,
    recovery_attempts
FROM dbos.workflow_status
WHERE status IN ('ERROR', 'MAX_RECOVERY_ATTEMPTS_EXCEEDED')
AND created_at > (EXTRACT(epoch FROM now()) - 86400) * 1000;

-- Slow Steps (> 5s duration)
CREATE OR REPLACE VIEW app.v_ops_slow_steps AS
SELECT 
    workflow_uuid,
    function_id,
    function_name,
    started_at_epoch_ms,
    completed_at_epoch_ms,
    (completed_at_epoch_ms - started_at_epoch_ms) as duration_ms,
    error
FROM dbos.operation_outputs
WHERE completed_at_epoch_ms IS NOT NULL 
AND started_at_epoch_ms IS NOT NULL
AND (completed_at_epoch_ms - started_at_epoch_ms) > 5000;

-- Queue Depth Snapshot
CREATE OR REPLACE VIEW app.v_ops_queue_depth AS
SELECT 
    queue_name,
    status,
    count(*) as workflow_count,
    min(created_at) as oldest_created_at,
    max(created_at) as newest_created_at
FROM dbos.workflow_status
WHERE status IN ('ENQUEUED', 'PENDING')
GROUP BY queue_name, status;
