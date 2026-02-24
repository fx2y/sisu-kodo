#!/usr/bin/env bash
set -euo pipefail

# Semantic policy probe: proof cards cannot ship unlabeled metric sources.
# Self-test: scripts/policy-proof-provenance.sh --self-test

pnpm exec tsx scripts/policy-proof-provenance.ts "$@"
