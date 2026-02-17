#!/usr/bin/env bash
set -euo pipefail

bad=0
while IFS=: read -r line_no block; do
  start=$line_no
  end=$(awk -v s="$start" 'NR>s && /^\[tasks\./ {print NR; exit}' mise.toml)
  if [ -z "$end" ]; then
    end=$(wc -l < mise.toml)
  else
    end=$((end - 1))
  fi
  section=$(sed -n "${start},${end}p" mise.toml)
  # Exceptions for reset tasks and top-level gates that MUST always run
  if echo "$block" | rg -q 'db:reset|db:sys:reset|check:|test:e2e|test:integration:mock|policy:'; then
    continue
  fi
  if echo "$section" | rg -q '^run\s*=|^run\s*\[' && ! echo "$section" | rg -q '^sources\s*='; then
    echo "task missing sources: $block" >&2
    bad=1
  fi
  # Expensive tasks must have outputs to enable caching
  if echo "$block" | rg -q 'test:|wf:|oc:|sbx:|build' && ! echo "$block" | rg -q 'db:test:' && ! echo "$section" | rg -q '^outputs\s*='; then
    echo "expensive task missing outputs: $block" >&2
    bad=1
  fi
done < <(rg -n '^\[tasks\.' mise.toml)

exit "$bad"
