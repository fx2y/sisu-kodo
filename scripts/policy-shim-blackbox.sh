#!/usr/bin/env bash
set -euo pipefail

SHIM_DIR="src/api-shim"
FORBIDDEN_IMPORT_REGEX='(from|import\s+|import\()\s*["'"'"'][^"'"'"']*workflow/(dbos|wf|steps|engine-dbos)(/|["'"'"'])'

run_probe() {
  local probe_dir="$1"
  rg -n --glob '*.ts' -e "$FORBIDDEN_IMPORT_REGEX" "$probe_dir" >/dev/null
}

run_self_test() {
  local bad_dir good_dir
  bad_dir="$(mktemp -d)"
  good_dir="$(mktemp -d)"
  trap 'rm -rf "$bad_dir" "$good_dir"' RETURN

  cat >"$bad_dir/violator.ts" <<'TS'
import "../workflow/dbos/intentWorkflow";
TS
  if ! run_probe "$bad_dir"; then
    echo "[Policy] FAIL: self-test expected relative workflow import violation but probe passed." >&2
    exit 1
  fi

  cat >"$good_dir/allowed.ts" <<'TS'
import "../workflow/port";
TS
  if run_probe "$good_dir"; then
    echo "[Policy] FAIL: self-test flagged allowed workflow port import." >&2
    exit 1
  fi
}

echo "[Policy] Checking API Shim black-box separation..."
if run_probe "$SHIM_DIR"; then
  echo "[Policy] FAIL: API Shim violates black-box separation." >&2
  rg -n --glob '*.ts' -e "$FORBIDDEN_IMPORT_REGEX" "$SHIM_DIR" >&2
  exit 1
fi

run_self_test
echo "[Policy] OK: API Shim is properly isolated."
