#!/usr/bin/env bash
set -euo pipefail

# ADR 002 canonical command pack

# 0) bootstrap
mise install

# 1) deterministic fast gate
mise run quick

# 2) authoritative resets (must always run, never cache)
mise run db:reset
mise run db:sys:reset

# 3) crash-resume proof lane (isolated ports)
PORT=3004 ADMIN_PORT=3006 mise run -f wf:crashdemo

# 4) sign-off lanes
mise run check
mise run -f check
mise run test:e2e
mise run -f test:e2e

# 5) integration lane with dedicated ports
PORT=3003 ADMIN_PORT=3005 mise run test:integration:mock

# 6) soak lanes (force rerun)
mise run -f wf:crashdemo:soak
mise run -f test:unit:soak

# 7) task graph introspection
mise tasks deps check

# 8) DBOS status helpers
mise run dbos:workflow:list
# replace with concrete id from list
# mise run dbos:workflow:status -- <workflow_id>

# 9) golden refresh is explicit only
# REFRESH_GOLDEN=1 mise run test:e2e

# 10) SQL proof of exactly-once marker writes
cat <<'SQL'
SELECT step, COUNT(*)
FROM app.marks
WHERE run_id = '<wf_id>'
GROUP BY step
ORDER BY step;
-- required: s1=1,s2=1
SQL
