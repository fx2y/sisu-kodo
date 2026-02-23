#!/usr/bin/env bash
set -euo pipefail
# Usage: ./resume_batch.sh < workflow_ids.txt
ACTOR=${OPS_ACTOR:-ops-batch}
REASON=${OPS_REASON:-batch-resume}
pnpm exec tsx scripts/ops/cli.ts resume --stdin --actor "$ACTOR" --reason "$REASON"
