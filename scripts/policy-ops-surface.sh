#!/usr/bin/env bash
set -euo pipefail

# G07.S2.02: Ops surface policy gate
# Verifies exact-6 ops routes, actor/reason propagation, and semantic guards.

check_route_count() {
  local count
  count=$(find app/api/ops/wf -name route.ts | wc -l)
  if [ "$count" -ne 6 ]; then
    echo "Ops surface drift: expected exactly 6 /api/ops/wf* routes, found $count" >&2
    find app/api/ops/wf -name route.ts >&2
    return 1
  fi
  return 0
}

check_actor_propagation() {
  local bad=0
  
  # Check cancel route
  if ! grep -q "cancelWorkflow(workflow, payload.id, pool, body.actor, body.reason)" app/api/ops/wf/\[wid\]/cancel/route.ts; then
    echo "Ops audit loss: /api/ops/wf/:wid/cancel route does not propagate actor/reason" >&2
    bad=1
  fi

  # Check resume route
  if ! grep -q "resumeWorkflow(workflow, payload.id, pool, body.actor, body.reason)" app/api/ops/wf/\[wid\]/resume/route.ts; then
    echo "Ops audit loss: /api/ops/wf/:wid/resume route does not propagate actor/reason" >&2
    bad=1
  fi

  # Check fork route
  if ! grep -q "forkWorkflow(workflow, payload.id, body, pool, body.actor, body.reason)" app/api/ops/wf/\[wid\]/fork/route.ts; then
    echo "Ops audit loss: /api/ops/wf/:wid/fork route does not propagate actor/reason" >&2
    bad=1
  fi

  return "$bad"
}

check_fork_guard() {
  if ! grep -q "request.stepN > maxStep" src/server/ops-api.ts; then
    echo "Ops semantic failure: forkWorkflow missing upper-bound guard for stepN" >&2
    return 1
  fi
  return 0
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

main
