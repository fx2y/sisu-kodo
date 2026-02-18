#!/usr/bin/env bash
set -euo pipefail
# S.OC.DOC.SNAPSHOT
VERSION=$(cat opencode.version 2>/dev/null || echo "unknown")
DIR="docs/contracts/opencode"
mkdir -p "$DIR"
OUT="$DIR/openapi-${VERSION}.json"
TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT
PORT="${OC_SERVER_PORT:-4096}"
HOST="${OC_SERVER_HOST:-127.0.0.1}"
BASE_URL="http://${HOST}:${PORT}"

if ! curl -sf "${BASE_URL}/doc" >"$TMP"; then
  echo "Error: Failed to fetch /doc from OC daemon at ${BASE_URL}/doc"
  echo "Ensure the daemon is running (mise run oc:daemon:up)"
  exit 1
fi

# S.OC.DOC.OPENAPI
if ! jq -e '.openapi|startswith("3.1")' "$TMP" >/dev/null; then
  echo "Error: Invalid OpenAPI version in $OUT (expected 3.1.x)"
  exit 1
fi

jq -S '.' "$TMP" >"$OUT"

echo "Captured OpenAPI snapshot to $OUT"
