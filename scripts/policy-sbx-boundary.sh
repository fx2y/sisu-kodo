#!/usr/bin/env bash
set -euo pipefail

SBX_DIR="src/sbx"
FORBIDDEN_SDK_REGEX='@e2b/code-interpreter|@microsandbox/sdk|child_process'

# Only src/sbx/** may import sandbox SDKs or child_process
check_sbx_boundary() {
  # Files outside src/sbx that import forbidden SDKs or child_process
  rg -n --glob 'src/**/*.ts' --glob "!$SBX_DIR/**/*.ts" "$FORBIDDEN_SDK_REGEX"
}

run_self_test() {
  local bad_dir
  bad_dir="$(mktemp -d)"
  trap 'rm -rf "$bad_dir"' RETURN

  cat >"$bad_dir/bad_e2b.ts" <<'TS'
import { Sandbox } from "@e2b/code-interpreter";
TS
  if ! rg -q "@e2b/code-interpreter" "$bad_dir/bad_e2b.ts"; then
    echo "[Policy] FAIL: self-test expected E2B violation but regex failed." >&2
    exit 1
  fi

  cat >"$bad_dir/bad_process.ts" <<'TS'
import { exec } from "child_process";
TS
  if ! rg -q "child_process" "$bad_dir/bad_process.ts"; then
    echo "[Policy] FAIL: self-test expected child_process violation but regex failed." >&2
    exit 1
  fi
}

run_self_test

echo "[Policy] Checking SBX boundary..."
VIOLATIONS=0

if check_sbx_boundary; then
  echo "[Policy] FAIL: SBX SDKs or child_process imported outside $SBX_DIR" >&2
  VIOLATIONS=1
fi

if [ $VIOLATIONS -eq 1 ]; then
  exit 1
fi

echo "[Policy] OK: SBX boundary preserved."
