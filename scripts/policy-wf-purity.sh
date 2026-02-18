#!/usr/bin/env bash
set -euo pipefail

WF_DIR="src/workflow/wf"
FORBIDDEN_IMPORT_PATTERN='(from|import\s+)\s*["'"'"'](fs|node:fs|net|node:net|http|node:http|https|node:https|pg|node:pg|.*\/db\/.*|.*\/workflow\/dbos\/.*)["'"'"']'
FORBIDDEN_PRIMITIVE_PATTERN='Date\.now|new Date|Math\.random|process\.env|process\.hrtime(\.bigint)?|crypto\.randomUUID|randomUUID\('

probe_imports() {
  local target="$1"
  rg -n --glob '*.ts' -e "$FORBIDDEN_IMPORT_PATTERN" "$target"
}

probe_primitives() {
  local target="$1"
  rg -n --glob '*.ts' -e "$FORBIDDEN_PRIMITIVE_PATTERN" "$target"
}

run_self_test() {
  local bad_dir good_dir
  bad_dir="$(mktemp -d)"
  good_dir="$(mktemp -d)"
  trap 'rm -rf "$bad_dir" "$good_dir"' RETURN

  cat >"$bad_dir/violator.ts" <<'TS'
import { randomUUID } from "node:crypto";
export const x = process.hrtime.bigint();
export const y = randomUUID();
TS
  if ! probe_primitives "$bad_dir" >/dev/null; then
    echo "ERROR: wf-purity self-test expected hrtime/randomUUID probe to fail." >&2
    exit 1
  fi

  cat >"$good_dir/allowed.ts" <<'TS'
export function stable(v: string): string {
  return v.toLowerCase();
}
TS
  if probe_primitives "$good_dir" >/dev/null; then
    echo "ERROR: wf-purity self-test false positive on allowed file." >&2
    exit 1
  fi
}

bad=0
if probe_imports "$WF_DIR" >/dev/null; then
  echo "ERROR: Forbidden imports found in ${WF_DIR}/:" >&2
  probe_imports "$WF_DIR" >&2
  bad=1
fi

if probe_primitives "$WF_DIR" >/dev/null; then
  echo "ERROR: Non-deterministic primitives found in ${WF_DIR}/:" >&2
  probe_primitives "$WF_DIR" >&2
  bad=1
fi

run_self_test

if [ "$bad" -eq 0 ]; then
  echo "Workflow purity check passed."
fi
exit "$bad"
