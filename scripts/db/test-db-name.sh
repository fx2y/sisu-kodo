#!/usr/bin/env bash
set -euo pipefail

sha=$(git rev-parse --short HEAD 2>/dev/null || echo dev)
echo "app_test_${sha}_${PPID:-$$}"
