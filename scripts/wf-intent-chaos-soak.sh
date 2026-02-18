#!/usr/bin/env bash
set -euo pipefail

for i in $(seq 1 20); do
  mise run -f wf:intent:chaos >/dev/null
  echo "intent chaos soak pass $i/20"
done
