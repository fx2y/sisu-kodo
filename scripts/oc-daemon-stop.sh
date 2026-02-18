#!/bin/bash
if [ -f .tmp/oc-daemon.pid ]; then
  PID=$(cat .tmp/oc-daemon.pid)
  kill $PID || true
  rm .tmp/oc-daemon.pid
  echo "OC Daemon stopped"
else
  # Fallback: kill by port if pid file missing
  PID=$(lsof -t -i:4096 || true)
  if [ -n "$PID" ]; then
    kill $PID || true
    echo "OC Daemon stopped (killed by port)"
  else
    echo "OC Daemon not running"
  fi
fi
