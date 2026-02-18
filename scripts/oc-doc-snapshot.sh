#!/bin/bash
set -e
# S.OC.DOC.SNAPSHOT
VERSION=$(cat opencode.version 2>/dev/null || echo "unknown")
DIR="docs/contracts/opencode"
mkdir -p $DIR
OUT="$DIR/openapi-${VERSION}.json"

if ! curl -sf http://127.0.0.1:4096/doc > "$OUT"; then
  echo "Error: Failed to fetch /doc from OC daemon at http://127.0.0.1:4096/doc"
  echo "Ensure the daemon is running (mise run oc:daemon:up)"
  exit 1
fi

# S.OC.DOC.OPENAPI
if ! jq -e '.openapi|startswith("3.1")' "$OUT" >/dev/null; then
  echo "Error: Invalid OpenAPI version in $OUT (expected 3.1.x)"
  exit 1
fi

echo "Captured OpenAPI snapshot to $OUT"
