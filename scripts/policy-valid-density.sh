#!/usr/bin/env bash
set -euo pipefail

# Density check for Ajv gate usage at boundaries.
# Expects: assertValid, assertIntent, assertRunRequest, assertRunView, etc.

COUNT=$(grep -rE "assert(Valid|Intent|RunRequest|RunView|ArtifactRef|OCOutput)" src/ | grep -v "test" | wc -l)

echo "Ajv boundary gate density: $COUNT calls found in src/"

if [ "$COUNT" -lt 5 ]; then
  echo "ERROR: Too few boundary gates found ($COUNT). Minimum 5 required for C2."
  exit 1
fi
