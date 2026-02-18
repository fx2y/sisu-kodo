#!/usr/bin/env bash
set -euo pipefail

pattern='Math\.random|Date\.now|new Date\(|process\.hrtime|crypto\.randomUUID'

if rg -n "$pattern" src --glob '!src/lib/rng.ts' --glob '!src/lib/time.ts' --glob '!src/oc/**/*.ts'; then
  echo "BAN: nondeterminism outside wrappers" >&2
  exit 1
fi
