#!/usr/bin/env bash
set -euo pipefail

scripts/db/up.sh

db_name="${APP_DB_NAME:-app_local}"

exists=$(docker compose exec -T db psql -tA -U "${DB_USER:-postgres}" -d "${SYSTEM_DB_NAME:-postgres}" -c "SELECT 1 FROM pg_database WHERE datname='${db_name}';" | tr -d '\r')
if [ "$exists" != "1" ]; then
  docker compose exec -T db psql -v ON_ERROR_STOP=1 -U "${DB_USER:-postgres}" -d "${SYSTEM_DB_NAME:-postgres}" -c "CREATE DATABASE \"${db_name}\";" >/dev/null
fi

for file in $(ls db/migrations/*.sql | sort); do
  cat "$file" | docker compose exec -T db psql -v ON_ERROR_STOP=1 -U "${DB_USER:-postgres}" -d "$db_name" >/dev/null
done
