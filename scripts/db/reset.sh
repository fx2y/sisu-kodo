#!/usr/bin/env bash
set -euo pipefail

scripts/db/migrate.sh

cat <<'SQL' | docker compose exec -T db psql -v ON_ERROR_STOP=1 -U "${DB_USER:-postgres}" -d "${APP_DB_NAME:-app_local}" >/dev/null
DROP SCHEMA IF EXISTS app CASCADE;
CREATE SCHEMA app;
SQL

for file in $(ls db/migrations/*.sql | sort); do
  cat "$file" | docker compose exec -T db psql -v ON_ERROR_STOP=1 -U "${DB_USER:-postgres}" -d "${APP_DB_NAME:-app_local}" >/dev/null
done
for file in $(ls db/seed/*.sql | sort); do
  cat "$file" | docker compose exec -T db psql -v ON_ERROR_STOP=1 -U "${DB_USER:-postgres}" -d "${APP_DB_NAME:-app_local}" >/dev/null
done
