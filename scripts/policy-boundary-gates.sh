#!/usr/bin/env bash
set -euo pipefail

bad=0

if [ ! -f test/golden/run-view.json ]; then
  echo "missing deterministic golden baseline: test/golden/run-view.json" >&2
  bad=1
fi

if ! rg -q "const workflowId = intentId;" src/workflow/start-intent.ts; then
  echo "workflow identity drift: start-intent must enforce workflowID=intentId" >&2
  bad=1
fi

if ! rg -q "duplicate side effect receipt detected" src/workflow/steps/run-intent.steps.ts; then
  echo "missing duplicate-side-effect guard in ExecuteST path" >&2
  bad=1
fi

if ! rg -q "\\[tasks\\.\"wf:intent:chaos:soak\"\\]" mise.toml; then
  echo "missing forced-rerun intent chaos soak task" >&2
  bad=1
fi

if ! rg -q "\\[tasks\\.\"sandbox:soak\"\\]" mise.toml; then
  echo "missing sandbox parallel soak task" >&2
  bad=1
fi

if ! rg -q "\\[tasks\\.\"wf:crashdemo\"\\]" mise.toml; then
  echo "legacy canary removed: wf:crashdemo task must remain" >&2
  bad=1
fi

if [ ! -f test/integration/oc-bug-8528.test.ts ] || [ ! -f test/integration/oc-bug-6396.test.ts ] || [ ! -f test/integration/oc-bug-11064.test.ts ]; then
  echo "missing mandatory bug regression suites (Bet E)" >&2
  bad=1
fi

if ! rg -q 'code !== "oc_stall"' src/oc/timeout-policy.ts; then
  echo "missing stall detector timeout policy guard" >&2
  bad=1
fi

if ! rg -q 'oc_timeout_terminal' src/oc/timeout-policy.ts; then
  echo "missing terminal timeout policy in OC timeout module" >&2
  bad=1
fi

exit "$bad"
