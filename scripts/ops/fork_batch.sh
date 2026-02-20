#!/usr/bin/env bash
set -euo pipefail
# Usage: ./fork_batch.sh STEP [APP_VERSION] < workflow_ids.txt
STEP=${1:-}
if [ -z "$STEP" ]; then
  echo "Error: STEP is required as first argument"
  exit 1
fi
APP_VERSION=${2:-}
while read -r wid; do
  if [ -n "$wid" ]; then
    echo "Forking workflow $wid at step $STEP..." >&2
    if [ -n "$APP_VERSION" ]; then
      pnpm exec dbos workflow fork "$wid" -S "$STEP" -v "$APP_VERSION"
    else
      pnpm exec dbos workflow fork "$wid" -S "$STEP"
    fi
  fi
done
