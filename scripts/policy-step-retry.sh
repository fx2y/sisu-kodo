#!/usr/bin/env bash
set -euo pipefail

TARGET_DIR="src/workflow/dbos"
TARGET_FILE="src/workflow/dbos/intentSteps.ts"
RETRY_PATTERN='retriesAllowed:\s*true'
ALLOWED_METHOD_REGEX='static async executeTask\('

check_retry_allowlist() {
  local scope="$1"
  local expected_file="${2:-}"
  local matches
  matches="$(rg -n "$RETRY_PATTERN" "$scope" || true)"
  local count
  count="$(printf "%s\n" "$matches" | sed '/^$/d' | wc -l | tr -d '[:space:]')"

  if [ "$count" -ne 1 ]; then
    echo "ERROR: expected exactly 1 retriesAllowed=true occurrence, found $count in $scope" >&2
    printf "%s\n" "$matches" >&2
    return 1
  fi

  local first file line
  first="$(printf "%s\n" "$matches" | head -n1)"
  file="$(printf "%s\n" "$first" | cut -d: -f1)"
  line="$(printf "%s\n" "$first" | cut -d: -f2)"

  if [ -n "$expected_file" ] && [ "$file" != "$expected_file" ]; then
    echo "ERROR: retriesAllowed=true found in $file; allowed only in $expected_file" >&2
    return 1
  fi

  if ! sed -n "${line},$((line + 14))p" "$file" | rg -q "$ALLOWED_METHOD_REGEX"; then
    echo "ERROR: retriesAllowed=true is not attached to executeTask in $file:$line" >&2
    sed -n "${line},$((line + 14))p" "$file" >&2
    return 1
  fi

  return 0
}

self_test() {
  local tmp_dir bad_file good_file
  tmp_dir="$(mktemp -d)"
  trap 'rm -rf "$tmp_dir"' RETURN
  mkdir -p "$tmp_dir/src/workflow/dbos"

  bad_file="$tmp_dir/src/workflow/dbos/intentSteps.ts"
  cat >"$bad_file" <<'TS'
class IntentSteps {
  @DBOS.step({ retriesAllowed: true, maxAttempts: 3 })
  static async compile(workflowId: string): Promise<void> {
    void workflowId;
  }
}
TS
  if check_retry_allowlist "$tmp_dir/src/workflow/dbos" "$bad_file"; then
    echo "ERROR: self-test expected reject for non-allowlisted method" >&2
    return 1
  fi

  good_file="$tmp_dir/src/workflow/dbos/intentSteps.ts"
  cat >"$good_file" <<'TS'
class IntentSteps {
  @DBOS.step({ retriesAllowed: true, maxAttempts: 3 })
  static async executeTask(req: unknown): Promise<void> {
    void req;
  }
}
TS
  if ! check_retry_allowlist "$tmp_dir/src/workflow/dbos" "$good_file"; then
    echo "ERROR: self-test expected allow for executeTask retry decorator" >&2
    return 1
  fi
}

self_test
check_retry_allowlist "$TARGET_DIR" "$TARGET_FILE"
echo "Step retry policy check passed (only executeTask may set retriesAllowed=true)."
