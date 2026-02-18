#!/bin/bash
set -e
# S.OC.AGENT.LIST
DIR="docs/contracts/opencode"
mkdir -p $DIR
OUT="$DIR/agents.json"

if ! curl -sf http://127.0.0.1:4096/global/agents > "$OUT"; then
  echo "Error: Failed to fetch /global/agents from OC daemon at http://127.0.0.1:4096/global/agents"
  echo "Ensure the daemon is running (mise run oc:daemon:up)"
  exit 1
fi

TMP="${OUT}.tmp"
if ! jq '.' "$OUT" > "$TMP"; then
  echo "Error: /global/agents response is not valid JSON."
  rm -f "$TMP"
  exit 1
fi
mv "$TMP" "$OUT"

if ! jq -e '((if type == "object" and has("data") then .data else . end) | map(.id) | index("plan") != null) and ((if type == "object" and has("data") then .data else . end) | map(.id) | index("build") != null)' "$OUT" >/dev/null 2>&1; then
  echo "Error: OC agents snapshot missing required plan/build agents."
  exit 1
fi

echo "Captured agents snapshot to $OUT"
jq . "$OUT"
