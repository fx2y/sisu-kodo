#!/usr/bin/env bash
set -euo pipefail

# Ensures queuePartitionKey is correctly propagated through the workflow fan-out.

workflow_file="src/workflow/dbos/intentWorkflow.ts"

check_propagation() {
  # Check the shared startTask helper keeps partition fallback deterministic.
  if ! rg -F -q "async function startTaskWorkflow(" "$workflow_file"; then
    echo "[Policy] FAIL: missing shared startTaskWorkflow helper" >&2
    return 1
  fi

  if ! rg -F -q 'queuePartitionKey: queuePartitionKey ?? "default-partition"' "$workflow_file"; then
    echo "[Policy] FAIL: queuePartitionKey not correctly propagated in IntentWorkflow.startTask" >&2
    return 1
  fi

  # Check both workflow entrypoints use the shared step factory (which includes startTask helper path).
  if ! rg -F -q "await runIntentWorkflow(buildIntentWorkflowSteps(), workflowId);" "$workflow_file"; then
    echo "[Policy] FAIL: IntentWorkflow.run is not wired to shared queuePartitionKey path" >&2
    return 1
  fi

  if ! rg -F -q "await repairRunWorkflow(buildIntentWorkflowSteps(), runId);" "$workflow_file"; then
    echo "[Policy] FAIL: IntentWorkflow.repair is not wired to shared queuePartitionKey path" >&2
    return 1
  fi

  return 0
}

echo "[Policy] Checking queuePartitionKey propagation..."
if ! check_propagation; then
  exit 1
fi

echo "[Policy] OK: queuePartitionKey propagation verified."
