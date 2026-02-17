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
  if echo "$section" | rg -q '^run\s*=|^run\s*\[' && ! echo "$section" | rg -q '^sources\s*='; then
    echo "task missing sources: $block" >&2
    bad=1
  fi
done < <(rg -n '^\[tasks\.' mise.toml)

exit "$bad"
