#!/usr/bin/env bash
set -euo pipefail

if [[ "${1:-}" == "--self-test" ]]; then
  pnpm exec tsx scripts/policy-assert-valid-density.ts --self-test
  exit 0
fi

if [[ $# -gt 0 ]]; then
  echo "usage: scripts/policy-assert-valid-density.sh [--self-test]" >&2
  exit 1
fi

pnpm exec tsx scripts/policy-assert-valid-density.ts
