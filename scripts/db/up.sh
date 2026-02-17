#!/usr/bin/env bash
set -euo pipefail

docker compose up -d db >/dev/null
cid=$(docker compose ps -q db)
if [ -z "$cid" ]; then
  echo "db container id missing" >&2
  exit 1
fi

for _ in $(seq 1 120); do
  health=$(docker inspect --format '{{.State.Health.Status}}' "$cid" 2>/dev/null || true)
  if [ "$health" = "healthy" ]; then
    docker compose exec -T db pg_isready -U "${DB_USER:-postgres}" -d "${SYSTEM_DB_NAME:-postgres}" >/dev/null
    exit 0
  fi
  sleep 0.25
done

echo "db did not become healthy" >&2
exit 1
