#!/usr/bin/env bash
set -euo pipefail

# Computes SBX performance metrics from SQL oracle
# Usage: ./scripts/sbx-perf-report.sh [run_id_prefix]

filter_prefix="${1:-}"
query_filter=""
if [ -n "$filter_prefix" ]; then
  query_filter="WHERE run_id LIKE '${filter_prefix}%'"
fi

echo "--- SBX PERF REPORT ---"

docker compose exec -T db psql -U "${DB_USER:-postgres}" -d "${APP_DB_NAME:-app_local}" <<EOF
WITH metrics AS (
  SELECT 
    (response->'metrics'->>'wallMs')::numeric AS wall_ms,
    (response->'metrics'->>'cpuMs')::numeric AS cpu_ms,
    (response->'metrics'->>'memPeakMB')::numeric AS mem_mb
  FROM app.sbx_runs
  ${query_filter}
),
stats AS (
  SELECT
    count(*) as count,
    percentile_cont(0.5) WITHIN GROUP (ORDER BY wall_ms) as p50_wall,
    percentile_cont(0.95) WITHIN GROUP (ORDER BY wall_ms) as p95_wall,
    percentile_cont(0.99) WITHIN GROUP (ORDER BY wall_ms) as p99_wall,
    percentile_cont(0.95) WITHIN GROUP (ORDER BY cpu_ms) as p95_cpu,
    max(mem_mb) as max_mem
  FROM metrics
)
SELECT 
  count as "Total Tasks",
  round(p50_wall::numeric, 2) as "p50 Wall (ms)",
  round(p95_wall::numeric, 2) as "p95 Wall (ms)",
  round(p99_wall::numeric, 2) as "p99 Wall (ms)",
  round(p95_cpu::numeric, 2) as "p95 CPU (ms)",
  round(max_mem::numeric, 2) as "Max Mem (MB)"
FROM stats;
EOF
