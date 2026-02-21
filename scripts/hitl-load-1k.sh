#!/usr/bin/env bash
set -euo pipefail

N="${N:-1000}"
HITL_LOAD_REPORT="${HITL_LOAD_REPORT:-.tmp/hitl-load-1k-report.json}"

PORT="${PORT:-3021}" \
N="$N" \
HITL_LOAD_REPORT="$HITL_LOAD_REPORT" \
scripts/hitl-soak-stack.sh pnpm exec tsx scripts/hitl-load-1k.ts
