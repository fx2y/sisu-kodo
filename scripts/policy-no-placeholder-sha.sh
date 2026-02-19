#!/usr/bin/env bash
set -euo pipefail

# Prevents placeholder SHA-256 digests in source code and fixtures.
# Digests MUST be real 64-hex values if they look like SHA-256.

PLACEHOLDER_REGEX='[0]{64}|[a-f0-9]{64}'
# We want to find cases where someone literally uses "placeholder" or "TODO" for a SHA
LITERAL_PLACEHOLDER_REGEX='sha256: "placeholder"|sha256: "todo"|sha256: "0000'

check_placeholders() {
  # Search for literal placeholders
  rg -i -n --glob 'src/**/*.ts' --glob 'test/**/*.ts' "$LITERAL_PLACEHOLDER_REGEX"
}

run_self_test() {
  local bad_file
  bad_file=$(mktemp)
  trap 'rm -f "$bad_file"' RETURN

  echo 'const sha = "0000000000000000000000000000000000000000000000000000000000000000";' > "$bad_file"
  if ! rg -q '[0]{64}' "$bad_file"; then
     echo "[Policy] FAIL: self-test regex failed to find 64 zeros" >&2
     exit 1
  fi
}

run_self_test

echo "[Policy] Checking for placeholder SHAs..."
VIOLATIONS=0

if check_placeholders; then
  echo "[Policy] FAIL: literal placeholder SHAs found in codebase" >&2
  VIOLATIONS=1
fi

# Also check for all-zeros SHA specifically
if rg -n --glob 'src/**/*.ts' --glob 'test/**/*.ts' '0000000000000000000000000000000000000000000000000000000000000000'; then
  echo "[Policy] FAIL: all-zero SHA digest found" >&2
  VIOLATIONS=1
fi

if [ $VIOLATIONS -eq 1 ]; then
  exit 1
fi

echo "[Policy] OK: No placeholder SHAs found."
