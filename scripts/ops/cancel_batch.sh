#!/usr/bin/env bash
set -euo pipefail
# Usage: ./cancel_batch.sh < workflow_ids.txt
while read -r wid; do
  if [ -n "$wid" ]; then
    echo "Canceling workflow $wid..." >&2
    pnpm exec dbos workflow cancel "$wid"
  fi
done
