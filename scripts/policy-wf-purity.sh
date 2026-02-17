#!/usr/bin/env bash
set -euo pipefail

# S.POLICY.WF.PURITY: Workflow purity enforcement
bad=0

# 1. Check for forbidden imports
# Pattern for fs, net, http, pg, and anything under src/db or src/workflow/dbos
FORBIDDEN_IMPORT_PATTERN='(fs|net|http|pg|.*/db/.*|.*/workflow/dbos/.*)'

if rg -q "from ['\"]${FORBIDDEN_IMPORT_PATTERN}['\"]" src/workflow/wf/; then
  echo "ERROR: Forbidden imports found in src/workflow/wf/:" >&2
  rg "from ['\"]${FORBIDDEN_IMPORT_PATTERN}['\"]" src/workflow/wf/ >&2
  bad=1
fi

# 2. Check for non-deterministic primitives
FORBIDDEN_PRIMITIVE_PATTERN='(Date\.now|Math\.random|process\.env|new Date)'

if rg -q -e "$FORBIDDEN_PRIMITIVE_PATTERN" src/workflow/wf/; then
  echo "ERROR: Non-deterministic primitives or environment access found in src/workflow/wf/:" >&2
  rg -e "$FORBIDDEN_PRIMITIVE_PATTERN" src/workflow/wf/ >&2
  bad=1
fi

if [ "$bad" -eq 0 ]; then
  echo "Workflow purity check passed."
fi

exit "$bad"
