#!/usr/bin/env bash
set -euo pipefail

# Policy: API Shim must NOT import from worker-specific directories
# Forbidden: src/workflow/dbos, src/workflow/wf, src/workflow/steps
# Allowed: src/contracts, src/db, src/lib, src/api-shim, src/workflow/port.ts (interface only)

SHIM_DIR="src/api-shim"
FORBIDDEN_PATTERNS=("src/workflow/dbos" "src/workflow/wf" "src/workflow/steps" "src/workflow/engine-dbos")

echo "[Policy] Checking API Shim black-box separation..."

FAILED=0
for pattern in "${FORBIDDEN_PATTERNS[@]}"; do
  # Grep for imports of forbidden patterns in shim directory
  if grep -r "$pattern" "$SHIM_DIR" --include="*.ts"; then
    echo "  FAILED: Found forbidden import of '$pattern' in $SHIM_DIR"
    FAILED=1
  fi
done

if [ $FAILED -eq 0 ]; then
  echo "[Policy] OK: API Shim is properly isolated."
  exit 0
else
  echo "[Policy] FAIL: API Shim violates black-box separation."
  exit 1
fi
