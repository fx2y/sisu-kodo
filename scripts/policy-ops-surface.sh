#!/usr/bin/env bash
set -euo pipefail

check_route_count() {
  local root="${1:-app/api/ops/wf}"
  local count
  count=$(find "$root" -name route.ts | wc -l | tr -d ' ')
  if [ "$count" -ne 6 ]; then
    echo "Ops surface drift: expected exactly 6 /api/ops/wf* routes, found $count" >&2
    find "$root" -name route.ts >&2
    return 1
  fi
  return 0
}

check_actor_propagation() {
  local root="${1:-app/api/ops/wf}"
  local bad=0

  if ! rg -n "cancelWorkflow\\(workflow, payload\\.id, pool, body\\.actor, body\\.reason\\)" \
    "$root/[wid]/cancel/route.ts" >/dev/null 2>&1; then
    echo "Ops audit loss: /api/ops/wf/:wid/cancel route does not propagate actor/reason" >&2
    bad=1
  fi

  if ! rg -n "resumeWorkflow\\(workflow, payload\\.id, pool, body\\.actor, body\\.reason\\)" \
    "$root/[wid]/resume/route.ts" >/dev/null 2>&1; then
    echo "Ops audit loss: /api/ops/wf/:wid/resume route does not propagate actor/reason" >&2
    bad=1
  fi

  if ! rg -n "forkWorkflow\\(workflow, payload\\.id, body, pool, body\\.actor, body\\.reason\\)" \
    "$root/[wid]/fork/route.ts" >/dev/null 2>&1; then
    echo "Ops audit loss: /api/ops/wf/:wid/fork route does not propagate actor/reason" >&2
    bad=1
  fi

  return "$bad"
}

check_fork_guard() {
  local ops_api="${1:-src/server/ops-api.ts}"
  if ! rg -n "request\\.stepN > maxStep" "$ops_api" >/dev/null 2>&1; then
    echo "Ops semantic failure: forkWorkflow missing upper-bound guard for stepN" >&2
    return 1
  fi
  return 0
}

run_self_test() {
  local tmp bad_root good_root
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' RETURN
  bad_root="$tmp/bad/app/api/ops/wf"
  good_root="$tmp/good/app/api/ops/wf"

  mkdir -p "$bad_root" "$good_root"
  for p in route.ts '[wid]/route.ts' '[wid]/steps/route.ts' '[wid]/cancel/route.ts' '[wid]/resume/route.ts'; do
    mkdir -p "$(dirname "$bad_root/$p")" "$(dirname "$good_root/$p")"
    printf 'export const x = 1;\n' >"$bad_root/$p"
    printf 'export const x = 1;\n' >"$good_root/$p"
  done

  # Bad: only 5 routes.
  if check_route_count "$bad_root"; then
    echo "ops-surface self-test failed: route-count detector false-positive" >&2
    exit 1
  fi

  # Good: add 6th route and propagation signatures.
  mkdir -p "$good_root/[wid]/fork"
  cat >"$good_root/[wid]/cancel/route.ts" <<'TS'
cancelWorkflow(workflow, payload.id, pool, body.actor, body.reason)
TS
  cat >"$good_root/[wid]/resume/route.ts" <<'TS'
resumeWorkflow(workflow, payload.id, pool, body.actor, body.reason)
TS
  cat >"$good_root/[wid]/fork/route.ts" <<'TS'
forkWorkflow(workflow, payload.id, body, pool, body.actor, body.reason)
TS
  if ! check_route_count "$good_root"; then
    echo "ops-surface self-test failed: expected route-count detector to pass" >&2
    exit 1
  fi
  if ! check_actor_propagation "$good_root"; then
    echo "ops-surface self-test failed: expected actor propagation detector to pass" >&2
    exit 1
  fi

  cat >"$tmp/bad-ops-api.ts" <<'TS'
export function forkWorkflow() { return null; }
TS
  if check_fork_guard "$tmp/bad-ops-api.ts"; then
    echo "ops-surface self-test failed: fork-guard detector false-positive" >&2
    exit 1
  fi

  cat >"$tmp/good-ops-api.ts" <<'TS'
if (request.stepN > maxStep) throw new Error("bad step");
TS
  if ! check_fork_guard "$tmp/good-ops-api.ts"; then
    echo "ops-surface self-test failed: expected fork-guard detector to pass" >&2
    exit 1
  fi
}

main() {
  local bad=0
  check_route_count || bad=1
  check_actor_propagation || bad=1
  check_fork_guard || bad=1

  if [ "$bad" -eq 0 ]; then
    echo "Ops surface policy: PASS"
  fi
  return "$bad"
}

if [ "${1:-}" = "--self-test" ]; then
  run_self_test
  exit 0
fi

if [ -n "${1:-}" ]; then
  echo "usage: scripts/policy-ops-surface.sh [--self-test]" >&2
  exit 2
fi

run_self_test
main
