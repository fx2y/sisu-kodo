#!/usr/bin/env bash
set -euo pipefail

# S.POLICY.OC.CONFIG
check_file() {
  local file="$1"

  if [ ! -f "$file" ]; then
    echo "Error: $file missing"
    return 1
  fi

  if jq -e '.mode' "$file" >/dev/null 2>&1; then
    echo "Error: Deprecated 'mode' field found in $file. Use 'agent' config instead."
    return 1
  fi

  if ! jq -e '.agent.plan' "$file" >/dev/null 2>&1; then
    echo "Error: Missing 'agent.plan' block in $file."
    return 1
  fi

  if ! jq -e '.agent.build' "$file" >/dev/null 2>&1; then
    echo "Error: Missing 'agent.build' block in $file."
    return 1
  fi

  if ! jq -e '.agent.plan.permission' "$file" >/dev/null 2>&1; then
    echo "Error: Missing 'permission' block for agent.plan in $file."
    return 1
  fi
}

self_test() {
  local tmp
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' RETURN

  cat >"$tmp/good.json" <<'JSON'
{"agent":{"plan":{"permission":{"*":"allow"}},"build":{"permission":{"*":"allow"}}}}
JSON
  cat >"$tmp/bad.json" <<'JSON'
{"mode":"plan","agent":{"plan":{"permission":{"*":"allow"}}}}
JSON

  if ! check_file "$tmp/good.json"; then
    echo "Error: self-test expected good config to pass."
    exit 1
  fi
  if check_file "$tmp/bad.json"; then
    echo "Error: self-test expected bad config to fail."
    exit 1
  fi
}

if [ "${1:-}" = "--self-test" ]; then
  self_test
  exit 0
fi

check_file "${1:-opencode.json}"
echo "OC config policy check passed."
