#!/usr/bin/env bash
set -euo pipefail
# Usage: ./resume_batch.sh < workflow_ids.txt
while read -r wid; do
  if [ -n "$wid" ]; then
    echo "Resuming workflow $wid..."
    pnpm exec dbos workflow resume "$wid"
  fi
done
