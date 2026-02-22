#!/usr/bin/env bash
set -euo pipefail

suite="${1:-}"
if [[ -z "$suite" ]]; then
  echo "usage: scripts/perf-k6-run.sh <smoke|ramp>" >&2
  exit 2
fi

mkdir -p .tmp/k6
summary=".tmp/k6/${suite}-summary.json"
metrics=".tmp/k6/${suite}-metrics.json"
log=".tmp/k6/${suite}.log"

run_k6() {
  if command -v k6 >/dev/null 2>&1; then
    K6_BASE_URL="${K6_BASE_URL:-http://127.0.0.1:${PORT:-3021}}" \
      k6 run "$@"
    return
  fi

  if command -v docker >/dev/null 2>&1; then
    docker run --rm --network host \
      -u "$(id -u):$(id -g)" \
      -e K6_BASE_URL="${K6_BASE_URL:-http://127.0.0.1:${PORT:-3021}}" \
      -e K6_BAD_FIXTURE="${K6_BAD_FIXTURE:-0}" \
      -e K6_VUS="${K6_VUS:-}" \
      -e K6_DURATION="${K6_DURATION:-}" \
      -e K6_P95_MS="${K6_P95_MS:-}" \
      -e K6_RAMP_UP="${K6_RAMP_UP:-}" \
      -e K6_RAMP_TARGET="${K6_RAMP_TARGET:-}" \
      -e K6_STEADY="${K6_STEADY:-}" \
      -e K6_RAMP_DOWN="${K6_RAMP_DOWN:-}" \
      -v "$(pwd):/work" \
      -w /work \
      grafana/k6:latest run "$@"
    return
  fi

  echo "k6 binary not found in PATH and docker unavailable for fallback" >&2
  exit 1
}

run_k6 \
  --summary-export "$summary" \
  --out "json=$metrics" \
  "perf/k6/${suite}.js" | tee "$log"
