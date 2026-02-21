#!/usr/bin/env bash
set -euo pipefail

# Backward-compatible wrapper around C7 load probe.
N="${N:-40}" scripts/hitl-load-1k.sh
