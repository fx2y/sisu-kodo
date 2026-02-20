#!/usr/bin/env bash
set -euo pipefail
# Usage: ./list_failed.sh [LIMIT]
LIMIT=${1:-10}
# Fetch ERROR and MAX_RECOVERY_ATTEMPTS_EXCEEDED separately as dbos CLI doesn't support multiple statuses in -S
(pnpm exec dbos workflow list -S ERROR -l "$LIMIT" && pnpm exec dbos workflow list -S MAX_RECOVERY_ATTEMPTS_EXCEEDED -l "$LIMIT") | jq -s 'add | .[].workflowID' -r | sort -u
