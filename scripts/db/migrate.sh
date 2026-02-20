#!/usr/bin/env bash
set -euo pipefail

scripts/db/up.sh

db_name="${APP_DB_NAME:-app_local}"
sys_db_name="${SYS_DB_NAME:-dbos_sys}"

exists=$(docker compose exec -T db psql -tA -U "${DB_USER:-postgres}" -d "${SYSTEM_DB_NAME:-postgres}" -c "SELECT 1 FROM pg_database WHERE datname='${db_name}';" | tr -d '\r')
if [ "$exists" != "1" ]; then
  docker compose exec -T db psql -v ON_ERROR_STOP=1 -U "${DB_USER:-postgres}" -d "${SYSTEM_DB_NAME:-postgres}" -c "CREATE DATABASE \"${db_name}\";" >/dev/null
fi

for file in $(ls db/migrations/*.sql | sort); do
  target_db="$db_name"
  # Heuristic: if file mentions dbos. it's a system database migration
  if grep -qi "dbos\." "$file"; then
    target_db="$sys_db_name"
    # Ensure app schema exists in sys db if we're creating views there
    docker compose exec -T db psql -U "${DB_USER:-postgres}" -d "$target_db" -c "CREATE SCHEMA IF NOT EXISTS app;" >/dev/null 2>&1 || true
  fi
  cat "$file" | docker compose exec -T db psql -v ON_ERROR_STOP=1 -U "${DB_USER:-postgres}" -d "$target_db" >/dev/null
done
