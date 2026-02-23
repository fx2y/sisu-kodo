#!/usr/bin/env bash
set -euo pipefail
pnpm exec tsx scripts/policy-no-bundlers.ts "$@"
