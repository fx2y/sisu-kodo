#!/usr/bin/env bash
set -euo pipefail

# Density check for Ajv gate usage at boundaries.
# Expects: assertValid, assertIntent, assertRunRequest, assertRunView, etc.

COUNT=$(grep -rE "assert(Valid|Intent|RunRequest|RunView|ArtifactRef|OCOutput)" src/ | grep -v "test" | wc -l)

echo "Ajv boundary gate density: $COUNT calls found in src/"

# Cycle C3 requires at least 10 gates (increased from C2's 5)
THRESHOLD=10

if [ "$COUNT" -lt "$THRESHOLD" ]; then
  echo "ERROR: Too few boundary gates found ($COUNT). Minimum $THRESHOLD required for C3."
  exit 1
fi

echo "Policy: Ajv gate density OK."
