#!/usr/bin/env bash
set -euo pipefail

# Toolchain + fast loop
mise install
mise run quick

# Full correctness loop
mise run check
mise run full

# Durability checks
mise run -f wf:crashdemo
mise run wf:crashdemo:soak

# Determinism policy checks
mise run policy:task-sources
mise run lint:flake

# DB lifecycle
mise run db:up
mise run db:reset
mise run db:test:create
mise run db:test:drop

# Marker invariant probe (replace workflow id)
docker compose exec -T postgres psql -U postgres -d app_local -c \
  "SELECT step,COUNT(*) FROM app.marks WHERE run_id='wf_crashdemo_fixed' GROUP BY step;"
