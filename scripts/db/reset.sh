#!/usr/bin/env bash
set -euo pipefail

cat <<'SQL' | docker compose exec -T db psql -v ON_ERROR_STOP=1 -U "${DB_USER:-postgres}" -d "${APP_DB_NAME:-app_local}" >/dev/null
DROP SCHEMA IF EXISTS app CASCADE;
CREATE SCHEMA app;
SQL

for file in $(ls db/migrations/*.sql | sort); do
  target_db="${APP_DB_NAME:-app_local}"
  if grep -qi "dbos\." "$file"; then
    target_db="${SYS_DB_NAME:-dbos_sys}"
    docker compose exec -T db psql -U "${DB_USER:-postgres}" -d "$target_db" -c "CREATE SCHEMA IF NOT EXISTS app;" >/dev/null 2>&1 || true
  fi
  cat "$file" | docker compose exec -T db psql -v ON_ERROR_STOP=1 -U "${DB_USER:-postgres}" -d "$target_db" >/dev/null
done
for file in $(ls db/seed/*.sql | sort); do
  cat "$file" | docker compose exec -T db psql -v ON_ERROR_STOP=1 -U "${DB_USER:-postgres}" -d "${APP_DB_NAME:-app_local}" >/dev/null
done
