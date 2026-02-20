#!/usr/bin/env bash
set -euo pipefail

TEST_DB_NAME="${TEST_DB_NAME:-$(scripts/db/test-db-name.sh)}"
export TEST_DB_NAME

cleanup() {
  TEST_DB_NAME="$TEST_DB_NAME" scripts/db/test-drop.sh >/dev/null || true
}
trap cleanup EXIT

TEST_DB_NAME="$TEST_DB_NAME" scripts/db/test-create.sh >/dev/null
# Cycle 2: reset system DB to avoid step cache interference from previous runs
mise run db:sys:reset >/dev/null
APP_DB_NAME="$TEST_DB_NAME" scripts/db/reset.sh >/dev/null
OC_MODE=replay DBOS_CONFIG_FILE=dbos-config.yaml APP_DB_NAME="$TEST_DB_NAME" TEST_SUITE=integration pnpm exec vitest run "${@:-test/integration}" --config vitest.config.ts --fileParallelism=false
