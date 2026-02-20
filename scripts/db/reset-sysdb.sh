#!/usr/bin/env bash
set -euo pipefail

# Ensure the system database exists
docker compose exec -T db psql -U "${DB_USER:-postgres}" -d postgres -c "CREATE DATABASE "${SYS_DB_NAME:-dbos_sys}";" 2>/dev/null || true

# Drop the dbos schema in the system database
echo "DROP SCHEMA IF EXISTS dbos CASCADE;" | scripts/db/psql-sys.sh -v ON_ERROR_STOP=1

# Re-initialize the dbos core schema
pnpm exec dbos migrate

# Re-initialize the custom system database extensions (handles our custom views)
scripts/db/migrate.sh
