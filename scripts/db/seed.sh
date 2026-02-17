#!/usr/bin/env bash
set -euo pipefail

scripts/db/up.sh

for file in $(ls db/seed/*.sql | sort); do
  cat "$file" | docker compose exec -T db psql -v ON_ERROR_STOP=1 -U "${DB_USER:-postgres}" -d "${APP_DB_NAME:-app_local}" >/dev/null
done
