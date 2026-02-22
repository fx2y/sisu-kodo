#!/usr/bin/env bash
set -euo pipefail

run_self_test() {
  if pnpm exec tsx -e 'import { assertGateReply } from "./src/contracts/hitl/gate-reply.schema"; assertGateReply({ payload: { choice: "yes" } });' >/dev/null 2>&1; then
    echo "policy-hitl-correctness self-test failed: bad fixture unexpectedly passed" >&2
    exit 1
  fi

  pnpm exec tsx -e 'import { assertGateReply } from "./src/contracts/hitl/gate-reply.schema"; assertGateReply({ payload: { choice: "yes" }, dedupeKey: "self-test", origin: "manual" });' >/dev/null
}

run_policy_probes() {
  scripts/test-integration-mock.sh test/integration/hitl-correctness-policy.test.ts
}

if [ "${1:-}" = "--self-test" ]; then
  run_self_test
  exit 0
fi

if [ -n "${1:-}" ]; then
  echo "usage: scripts/policy-hitl-correctness.sh [--self-test]" >&2
  exit 2
fi

run_self_test
run_policy_probes
