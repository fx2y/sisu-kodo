#!/usr/bin/env bash
set -euo pipefail

if [[ "${1:-}" == "--self-test" ]]; then
  pnpm exec tsx scripts/policy-queue-partition-propagation.ts --self-test
  exit 0
fi

if [[ -n "${1:-}" ]]; then
  echo "usage: scripts/policy-queue-partition-propagation.sh [--self-test]" >&2
  exit 2
fi

pnpm exec tsx scripts/policy-queue-partition-propagation.ts
