#!/usr/bin/env bash
set -euo pipefail

OC_DIR="src/oc"
FORBIDDEN_SDK_IMPORT_REGEX='@opencode-ai/sdk'
FORBIDDEN_PARENT_ID_REGEX='parentID'

# Only src/oc/** may import @opencode-ai/sdk
check_sdk_boundary() {
  # Files outside src/oc that import the SDK
  rg -n --glob 'src/**/*.ts' --glob "!$OC_DIR/**/*.ts" "$FORBIDDEN_SDK_IMPORT_REGEX"
}

# No one may use parentID (Bet E)
check_parent_id() {
  rg -n --glob 'src/**/*.ts' "$FORBIDDEN_PARENT_ID_REGEX"
}

run_self_test() {
  local bad_dir
  bad_dir="$(mktemp -d)"
  trap 'rm -rf "$bad_dir"' RETURN

  cat >"$bad_dir/bad_sdk.ts" <<'TS'
import { createOpencodeClient } from "@opencode-ai/sdk";
TS
  if ! rg -q "$FORBIDDEN_SDK_IMPORT_REGEX" "$bad_dir/bad_sdk.ts"; then
    echo "[Policy] FAIL: self-test expected SDK import violation but regex failed." >&2
    exit 1
  fi

  cat >"$bad_dir/bad_parent.ts" <<'TS'
const x = { parentID: "foo" };
TS
  if ! rg -q "$FORBIDDEN_PARENT_ID_REGEX" "$bad_dir/bad_parent.ts"; then
    echo "[Policy] FAIL: self-test expected parentID violation but regex failed." >&2
    exit 1
  fi
}

run_self_test

echo "[Policy] Checking OC boundary and SDK usage..."
VIOLATIONS=0

if check_sdk_boundary; then
  echo "[Policy] FAIL: @opencode-ai/sdk imported outside $OC_DIR" >&2
  VIOLATIONS=1
fi

if check_parent_id; then
  echo "[Policy] FAIL: parentID usage detected (banned per Bet E)" >&2
  VIOLATIONS=1
fi

if [ $VIOLATIONS -eq 1 ]; then
  exit 1
fi

echo "[Policy] OK: OC boundary preserved."
