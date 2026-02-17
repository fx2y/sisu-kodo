#!/usr/bin/env bash
set -euo pipefail

# Policy: No app tables in 'dbos' schema.
# DBOS system tables belong in 'dbos', app tables elsewhere (usually public or app).

BAD=$(rg -i "create\s+table\s+dbos\." db/migrations/ || true)

if [ -n "$BAD" ]; then
  echo "ERROR: App migrations attempting to create tables in 'dbos' schema:"
  echo "$BAD"
  exit 1
fi

echo "Policy: No app tables in 'dbos' schema."
