-- Migration 030: CY6 Throughput Views
-- Views for fairness and priority monitoring.

CREATE OR REPLACE VIEW app.v_ops_queue_fairness AS
SELECT 
    queue_name,
    queue_partition_key,
    status,
    count(*) as workflow_count,
    min(created_at) as oldest_created_at,
    max(created_at) as newest_created_at
FROM dbos.workflow_status
WHERE status IN ('ENQUEUED', 'PENDING', 'WAITING')
GROUP BY queue_name, queue_partition_key, status;

CREATE OR REPLACE VIEW app.v_ops_queue_priority AS
SELECT 
    queue_name,
    priority,
    status,
    count(*) as workflow_count,
    avg(updated_at - created_at) as avg_latency_ms
FROM dbos.workflow_status
WHERE status IN ('ENQUEUED', 'PENDING', 'WAITING')
GROUP BY queue_name, priority, status;
