#!/usr/bin/env bash
set -euo pipefail
# Usage: ./cancel_batch.sh < workflow_ids.txt
ACTOR=${OPS_ACTOR:-ops-batch}
REASON=${OPS_REASON:-batch-cancel}
pnpm exec tsx scripts/ops/cli.ts cancel --stdin --actor "$ACTOR" --reason "$REASON"
