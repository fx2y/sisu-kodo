#!/usr/bin/env bash
set -euo pipefail
# S.POLICY.OC.DOCDIFF

diff_normalized_json() {
  local left right left_norm right_norm
  left="$1"
  right="$2"
  left_norm="$(mktemp)"
  right_norm="$(mktemp)"
  jq -S '.' "$left" >"$left_norm"
  jq -S '.' "$right" >"$right_norm"
  if ! diff -u "$left_norm" "$right_norm"; then
    rm -f "$left_norm" "$right_norm"
    return 1
  fi
  rm -f "$left_norm" "$right_norm"
}

# Self-test logic
if [[ "${1:-}" == "--self-test" ]]; then
  echo "Running self-test..."
  GOOD="fixtures/policy/oc-doc-diff/good.json"
  BAD="fixtures/policy/oc-doc-diff/bad.json"

  # Should pass when comparing same
  diff_normalized_json "$GOOD" "$GOOD" >/dev/null
  # Should fail when comparing different
  if diff_normalized_json "$GOOD" "$BAD" >/dev/null; then
    echo "Self-test failed: drifted files passed diff"
    exit 1
  fi
  echo "Self-test passed"
  exit 0
fi

VERSION=$(cat opencode.version 2>/dev/null || echo "unknown")
CURRENT="docs/contracts/opencode/openapi-${VERSION}.json"
PREV="docs/contracts/opencode/openapi-prev.json"

if [ ! -f "$PREV" ]; then
  echo "Warning: No previous snapshot found at $PREV. Initialize it if this is the first version."
  exit 0
fi

if [ ! -f "$CURRENT" ]; then
  echo "Error: Current snapshot not found at $CURRENT. Run: mise run oc:doc:snapshot"
  exit 1
fi

if ! diff_normalized_json "$PREV" "$CURRENT"; then
  echo "Error: OpenAPI drift detected! If this is intentional, update $PREV"
  exit 1
fi

echo "OpenAPI contract is stable."
