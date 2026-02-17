#!/usr/bin/env bash
set -euo pipefail

# Harden soak: always force-rerun and ensure clean DB state between runs if possible
# (though crashdemo resets DB as a dependency)
for i in $(seq 1 20); do
  # Bypass mise cache to find flakes
  mise run -f wf:crashdemo >/dev/null
  echo "crashdemo soak pass $i/20"
done
