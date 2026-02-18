#!/usr/bin/env bash
set -euo pipefail

FORBIDDEN_PARENT_ID_REGEX='parentID|parent_id'

# No one may use parentID or parent_id (Bet E)
check_parent_id() {
  rg -n --glob 'src/**/*.ts' "$FORBIDDEN_PARENT_ID_REGEX"
}

run_self_test() {
  local bad_dir
  bad_dir="$(mktemp -d)"
  trap 'rm -rf "$bad_dir"' RETURN

  cat >"$bad_dir/bad_parent.ts" <<'TS'
const x = { parentID: "foo" };
TS
  if ! rg -q "$FORBIDDEN_PARENT_ID_REGEX" "$bad_dir/bad_parent.ts"; then
    echo "[Policy] FAIL: self-test expected parentID violation but regex failed." >&2
    exit 1
  fi

  cat >"$bad_dir/bad_parent2.ts" <<'TS'
const x = { parent_id: "foo" };
TS
  if ! rg -q "$FORBIDDEN_PARENT_ID_REGEX" "$bad_dir/bad_parent2.ts"; then
    echo "[Policy] FAIL: self-test expected parent_id violation but regex failed." >&2
    exit 1
  fi

  cat >"$bad_dir/good.ts" <<'TS'
const x = { sessionId: "ok", parentRef: "ok" };
TS
  if rg -q "$FORBIDDEN_PARENT_ID_REGEX" "$bad_dir/good.ts"; then
    echo "[Policy] FAIL: self-test expected good fixture to pass but regex matched." >&2
    exit 1
  fi
}

run_self_test

echo "[Policy] Checking for child session triggers (parentID/parent_id)..."
if check_parent_id; then
  echo "[Policy] FAIL: parentID/parent_id usage detected (banned per Bet E)" >&2
  exit 1
fi

echo "[Policy] OK: No child session triggers found."
