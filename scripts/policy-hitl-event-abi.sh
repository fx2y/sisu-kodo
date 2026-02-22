#!/bin/bash
set -e

# Policy: HITL Event ABI must be frozen. 
# Replaced grep checks with TS semantic probe (assert funcs + fixture-driven pass/fail + runtime key builders).

if [[ "${1:-}" == "--self-test" ]]; then
  pnpm exec tsx scripts/policy-hitl-event-abi.ts --self-test
  exit 0
fi

if [[ -n "${1:-}" ]]; then
  echo "usage: scripts/policy-hitl-event-abi.sh [--self-test]" >&2
  exit 2
fi

pnpm exec tsx scripts/policy-hitl-event-abi.ts
