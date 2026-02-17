#!/usr/bin/env bash
set -euo pipefail

for i in $(seq 1 20); do
  mise run -f wf:crashdemo >/dev/null
  echo "crashdemo soak pass $i/20"
done
