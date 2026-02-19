#!/usr/bin/env bash
set -euo pipefail

# Ensures queuePartitionKey is correctly propagated through the workflow fan-out.

check_propagation() {
  # Check that startTask in intentWorkflow.ts passes queuePartitionKey
  # Use -F for fixed string match to avoid regex meta-character issues with ??
  if ! rg -F -q 'queuePartitionKey: queuePartitionKey ?? "default-partition"' src/workflow/dbos/intentWorkflow.ts; then
    echo "[Policy] FAIL: queuePartitionKey not correctly propagated in IntentWorkflow.startTask" >&2
    return 1
  fi

  # Check that repair workflow also propagates it
  if ! grep -A 15 "repair(" src/workflow/dbos/intentWorkflow.ts | rg -F -q 'queuePartitionKey: queuePartitionKey ?? "default-partition"'; then
    echo "[Policy] FAIL: queuePartitionKey not correctly propagated in IntentWorkflow.repair" >&2
    return 1
  fi

  return 0
}

echo "[Policy] Checking queuePartitionKey propagation..."
if ! check_propagation; then
  exit 1
fi

echo "[Policy] OK: queuePartitionKey propagation verified."
