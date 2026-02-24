#!/usr/bin/env bash
set -euo pipefail

TEST_DB_NAME="${TEST_DB_NAME:-$(scripts/db/test-db-name.sh)}"
export TEST_DB_NAME
TEST_SYS_DB_NAME="${TEST_SYS_DB_NAME:-${TEST_DB_NAME}_sys}"
export TEST_SYS_DB_NAME

cleanup() {
  TEST_DB_NAME="$TEST_SYS_DB_NAME" scripts/db/test-drop.sh >/dev/null || true
  TEST_DB_NAME="$TEST_DB_NAME" scripts/db/test-drop.sh >/dev/null || true
}
trap cleanup EXIT

TEST_DB_NAME="$TEST_DB_NAME" scripts/db/test-create.sh >/dev/null
# Isolate system DB per integration lane to avoid cross-lane dbos schema drops.
TEST_DB_NAME="$TEST_SYS_DB_NAME" scripts/db/test-create.sh >/dev/null
SYS_DB_NAME="$TEST_SYS_DB_NAME" scripts/db/reset-sysdb.sh >/dev/null
APP_DB_NAME="$TEST_DB_NAME" scripts/db/reset.sh >/dev/null
# Ensure we point to the correct DB for seeding
export APP_DB_NAME="$TEST_DB_NAME"
pnpm exec tsx scripts/seed-recipes-v1.ts >/dev/null
OC_MODE=replay DBOS_CONFIG_FILE=dbos-config.yaml APP_DB_NAME="$TEST_DB_NAME" SYS_DB_NAME="$TEST_SYS_DB_NAME" TEST_SUITE=integration pnpm exec vitest run "${@:-test/integration}" --config vitest.config.ts --fileParallelism=false
