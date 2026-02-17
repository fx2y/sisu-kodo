#!/usr/bin/env bash
set -euo pipefail

# Harden soak: always force-rerun and avoid vitest cache
for i in $(seq 1 50); do
  # Use mise to benefit from task setup but force bypass mise cache
  mise run -f test:unit >/dev/null
  echo "unit soak pass $i/50"
done
