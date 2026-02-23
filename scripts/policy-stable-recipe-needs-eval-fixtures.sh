#!/usr/bin/env bash
set -euo pipefail
pnpm exec tsx scripts/policy-stable-recipe-needs-eval-fixtures.ts "$@"

