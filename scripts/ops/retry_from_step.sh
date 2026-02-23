#!/usr/bin/env bash
set -euo pipefail
# Usage: ./retry_from_step.sh STEP [APP_VERSION] < workflow_ids.txt
STEP=${1:-}
if [ -z "$STEP" ]; then
  echo "Error: STEP is required as first argument" >&2
  exit 1
fi
APP_VERSION=${2:-}
ACTOR=${OPS_ACTOR:-ops-batch}
REASON=${OPS_REASON:-batch-retry-from-step}
if [ -n "$APP_VERSION" ]; then
  pnpm exec tsx scripts/ops/cli.ts retry-from-step \
    --stdin \
    --step "$STEP" \
    --app-version "$APP_VERSION" \
    --actor "$ACTOR" \
    --reason "$REASON"
else
  pnpm exec tsx scripts/ops/cli.ts retry-from-step \
    --stdin \
    --step "$STEP" \
    --actor "$ACTOR" \
    --reason "$REASON"
fi
