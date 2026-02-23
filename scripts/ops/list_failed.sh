#!/usr/bin/env bash
set -euo pipefail
# Usage: ./list_failed.sh [LIMIT]
LIMIT=${1:-10}
pnpm exec tsx scripts/ops/cli.ts list \
  --status ERROR \
  --status MAX_RECOVERY_ATTEMPTS_EXCEEDED \
  --limit "$LIMIT" \
  --format ids
