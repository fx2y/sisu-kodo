#!/usr/bin/env bash
set -euo pipefail
pnpm exec tsx scripts/policy-ops-surface.ts "$@"

