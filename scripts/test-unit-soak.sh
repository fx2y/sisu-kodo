#!/usr/bin/env bash
set -euo pipefail

for i in $(seq 1 50); do
  TEST_SUITE=unit pnpm exec vitest run test/unit --config vitest.config.ts >/dev/null
  echo "unit soak pass $i/50"
done
