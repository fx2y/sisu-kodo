#!/usr/bin/env bash
set -euo pipefail

N="${N:-1000}"
HITL_BURST_REPORT="${HITL_BURST_REPORT:-.tmp/hitl-burst-reply-report.json}"
HITL_SQL_EVIDENCE="${HITL_SQL_EVIDENCE:-.tmp/hitl-c7-sql-evidence.json}"

PORT="${PORT:-3021}" \
N="$N" \
HITL_BURST_REPORT="$HITL_BURST_REPORT" \
HITL_SQL_EVIDENCE="$HITL_SQL_EVIDENCE" \
scripts/hitl-soak-stack.sh pnpm exec tsx scripts/hitl-burst-reply.ts
