#!/usr/bin/env bash
set -euo pipefail

readonly WF_DIR="src/workflow/wf"
readonly WF_CORE_FILE="src/workflow/wf/run-intent.wf.ts"
readonly EVAL_DIR="src/eval"
readonly FORBIDDEN_IMPORT_PATTERN='(from|import\s+)\s*["'"'"'](fs|node:fs|net|node:net|http|node:http|https|node:https|pg|node:pg|.*\/db\/.*|.*\/workflow\/dbos\/.*)["'"'"']'
readonly FORBIDDEN_PRIMITIVE_PATTERN='Date\.now|new Date|Math\.random|process\.env|process\.hrtime(\.bigint)?|crypto\.randomUUID|randomUUID\('
readonly FORBIDDEN_GOAL_BRANCH_PATTERN='intent\.goal\.toLowerCase\(\)\.includes\('
readonly FORBIDDEN_EVAL_IMPURITY_PATTERN='Date\.now|new Date|Math\.random|process\.hrtime(\.bigint)?|crypto\.randomUUID|randomUUID\(|fetch\(|\baxios\b|from[[:space:]]+["'"'"'](net|node:net|http|node:http|https|node:https|undici)["'"'"']'

probe_imports() {
  local target="$1"
  rg -n --glob '*.ts' -e "$FORBIDDEN_IMPORT_PATTERN" "$target"
}

probe_primitives() {
  local target="$1"
  rg -n --glob '*.ts' -e "$FORBIDDEN_PRIMITIVE_PATTERN" "$target"
}

probe_goal_branches() {
  local target="$1"
  rg -n -e "$FORBIDDEN_GOAL_BRANCH_PATTERN" "$target"
}

probe_eval_impurity() {
  local target="$1"
  rg -n --glob '*.ts' -e "$FORBIDDEN_EVAL_IMPURITY_PATTERN" "$target"
}

run_self_test() {
  local bad_dir good_dir bad_goal_file good_goal_file bad_eval_file good_eval_file
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

  bad_goal_file="$bad_dir/run-intent.wf.ts"
  cat >"$bad_goal_file" <<'TS'
export function probe(intent: { goal: string }): boolean {
  return intent.goal.toLowerCase().includes("ask");
}
TS
  if ! probe_goal_branches "$bad_goal_file" >/dev/null; then
    echo "ERROR: wf-purity self-test expected goal-branch probe to fail." >&2
    exit 1
  fi

  good_goal_file="$good_dir/run-intent.wf.ts"
  cat >"$good_goal_file" <<'TS'
export function probe(flag: boolean): boolean {
  return flag;
}
TS
  if probe_goal_branches "$good_goal_file" >/dev/null; then
    echo "ERROR: wf-purity self-test false positive on goal-branch probe." >&2
    exit 1
  fi

  bad_eval_file="$bad_dir/eval.ts"
  cat >"$bad_eval_file" <<'TS'
import { request } from "node:https";
export const result = Date.now() + Number(Boolean(request));
TS
  if ! probe_eval_impurity "$bad_eval_file" >/dev/null; then
    echo "ERROR: wf-purity self-test expected eval impurity probe to fail." >&2
    exit 1
  fi

  good_eval_file="$good_dir/eval.ts"
  cat >"$good_eval_file" <<'TS'
export function compareStrings(a: string, b: string): boolean {
  return a === b;
}
TS
  if probe_eval_impurity "$good_eval_file" >/dev/null; then
    echo "ERROR: wf-purity self-test false positive on eval impurity probe." >&2
    exit 1
  fi
}

run_policy_checks() {
  local bad=0

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

  if probe_goal_branches "$WF_CORE_FILE" >/dev/null; then
    echo "ERROR: Goal-string branching is forbidden in ${WF_CORE_FILE}." >&2
    probe_goal_branches "$WF_CORE_FILE" >&2
    bad=1
  fi

  if [ -d "$EVAL_DIR" ] && probe_eval_impurity "$EVAL_DIR" >/dev/null; then
    echo "ERROR: Eval purity violation detected in ${EVAL_DIR}/ (net/time/rng forbidden)." >&2
    probe_eval_impurity "$EVAL_DIR" >&2
    bad=1
  fi

  return "$bad"
}

if [ "${1:-}" = "--self-test" ]; then
  run_self_test
  exit 0
fi

if [ -n "${1:-}" ]; then
  echo "usage: scripts/policy-wf-purity.sh [--self-test]" >&2
  exit 2
fi

run_self_test
run_policy_checks

echo "Workflow purity check passed."

exit 0
