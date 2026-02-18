#!/bin/bash
set -e
mkdir -p .tmp
if [ -f .tmp/oc-daemon.pid ]; then
  PID=$(cat .tmp/oc-daemon.pid)
  if ps -p $PID > /dev/null 2>&1; then
    echo "OC Daemon already running at $PID"
    exit 0
  fi
fi

# S.OC.DAEMON.SERVE
if command -v opencode >/dev/null 2>&1; then
  opencode serve --hostname 127.0.0.1 --port 4096 --cors http://localhost:3000 > .tmp/oc-daemon.log 2>&1 &
else
  echo "opencode binary not found, falling back to mock daemon..."
  pnpm exec tsx scripts/oc-mock-daemon.ts > .tmp/oc-daemon.log 2>&1 &
fi
echo $! > .tmp/oc-daemon.pid
echo "OC Daemon started at $(cat .tmp/oc-daemon.pid)"
