#!/usr/bin/env bash
set -euo pipefail
# Usage: ./psql-sys.sh "SQL COMMAND" or pipe to it
docker compose exec -T db psql -v ON_ERROR_STOP=1 -U "${DB_USER:-postgres}" -d "${SYS_DB_NAME:-dbos_sys}" "$@"
