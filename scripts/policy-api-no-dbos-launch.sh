#!/bin/bash
set -e

if [[ "${1:-}" == "--self-test" ]]; then
  pnpm exec tsx scripts/policy-api-no-dbos-launch.ts --self-test
  exit 0
fi

if [[ -n "${1:-}" ]]; then
  echo "usage: scripts/policy-api-no-dbos-launch.sh [--self-test]" >&2
  exit 2
fi

pnpm exec tsx scripts/policy-api-no-dbos-launch.ts
