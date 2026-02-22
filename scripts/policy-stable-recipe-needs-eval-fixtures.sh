#!/usr/bin/env bash
set -euo pipefail

TARGET_FILE="src/db/recipeRepo.ts"

run_self_test() {
  local bad_file good_file
  bad_file="$(mktemp)"
  good_file="$(mktemp)"
  trap 'rm -f "$bad_file" "$good_file"' RETURN

  cat >"$bad_file" <<'TS'
export async function promoteStable() {
  return true;
}
TS
  if rg -q "evalCount < 1" "$bad_file"; then
    echo "ERROR: self-test expected bad fixture to fail eval guard probe." >&2
    exit 1
  fi

  cat >"$good_file" <<'TS'
export async function promoteStable() {
  if (evalCount < 1 || fixtureCount < 1) return false;
}
TS
  if ! rg -q "evalCount < 1 \\|\\| fixtureCount < 1" "$good_file"; then
    echo "ERROR: self-test expected good fixture to pass guard probe." >&2
    exit 1
  fi
}

run_policy_checks() {
  local bad=0
  if ! rg -q "evalCount < 1 \\|\\| fixtureCount < 1" "$TARGET_FILE"; then
    echo "ERROR: missing stable promotion guard requiring >=1 eval and >=1 fixture." >&2
    bad=1
  fi
  if ! rg -q "jsonb_array_length\\(COALESCE\\(rv.json->'eval'" "$TARGET_FILE"; then
    echo "ERROR: missing eval coverage query in promotion transaction." >&2
    bad=1
  fi
  return "$bad"
}

if [ "${1:-}" = "--self-test" ]; then
  run_self_test
  exit 0
fi

if [ -n "${1:-}" ]; then
  echo "usage: scripts/policy-stable-recipe-needs-eval-fixtures.sh [--self-test]" >&2
  exit 2
fi

run_self_test
run_policy_checks
echo "Stable promotion guard policy: PASS"
