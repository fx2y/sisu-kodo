#!/usr/bin/env bash
set -euo pipefail

scripts/db/up.sh

db_name="${TEST_DB_NAME:-$(scripts/db/test-db-name.sh)}"

docker compose exec -T db psql -v ON_ERROR_STOP=1 -U "${DB_USER:-postgres}" -d "${SYSTEM_DB_NAME:-postgres}" -c "DROP DATABASE IF EXISTS \"${db_name}\" WITH (FORCE);" >/dev/null
docker compose exec -T db psql -v ON_ERROR_STOP=1 -U "${DB_USER:-postgres}" -d "${SYSTEM_DB_NAME:-postgres}" -c "CREATE DATABASE \"${db_name}\";" >/dev/null

echo "$db_name"
