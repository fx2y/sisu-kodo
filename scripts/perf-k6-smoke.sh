#!/usr/bin/env bash
set -euo pipefail

PORT="${PORT:-3021}" scripts/hitl-soak-stack.sh scripts/perf-k6-run.sh smoke
