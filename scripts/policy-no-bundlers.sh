#!/usr/bin/env bash
set -euo pipefail

# Policy: No bundlers in the project.
# We prefer direct tsc/node or tsx to avoid opaque build layers.

BAD=$(grep -rEi "esbuild|webpack|rollup|vite|parcel" package.json src/ | grep -vi "vitest" | grep -v "vitest.config.ts" || true)

if [ -n "$BAD" ]; then
  echo "ERROR: Bundler keywords found:"
  echo "$BAD"
  exit 1
fi

echo "Policy: No bundlers detected."
