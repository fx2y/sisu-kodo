#!/usr/bin/env bash
set -euo pipefail

tasks=(
  "policy:assert-valid-density"
  "policy:no-bundlers"
  "policy:no-dbos-ddl"
  "policy:task-sources"
  "policy:wf-purity"
  "policy:step-retry"
  "policy:shim-blackbox"
  "policy:boundary-gates"
  "policy:oc-boundary"
  "policy:sbx-boundary"
  "policy:oc-doc-diff"
  "policy:oc-config"
  "policy:no-parentid"
  "policy:no-placeholder-sha"
  "policy:queue-partition-propagation"
  "policy:api-no-dbos-launch"
  "policy:queue-class-parity"
  "policy:ops-surface"
  "policy:stable-recipe-needs-eval-fixtures"
  "policy:hitl-abi"
  "policy:hitl-event-abi"
  "policy:proof-provenance"
)

for task in "${tasks[@]}"; do
  echo "[policy] running ${task}"
  mise run -f "$task"
done

echo "policy aggregate: PASS"

