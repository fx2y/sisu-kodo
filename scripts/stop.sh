#!/bin/bash
set -euo pipefail

# Stop worker and shim processes
echo "Stopping worker and api-shim processes..."
pkill -9 -f "node dist/worker/main.js" || true
pkill -9 -f "node dist/api-shim/main.js" || true
pkill -9 -f "tsx scripts/oc-mock-daemon.ts" || true
pkill -9 -f "node dist/main.js" || true
pkill -9 -f "src/worker/main.ts" || true
pkill -9 -f "src/api-shim/main.ts" || true
pkill -9 -f "src/main.ts" || true
pkill -9 -f "tsx" || true
pkill -9 -f "node dist/" || true

# Force kill anything on the main ports
for port in ${PORT:-3001} ${ADMIN_PORT:-3002} ${OC_SERVER_PORT:-4096} 3001 3002 3004 3006 4096 4196; do
  lsof -ti :$port | xargs kill -9 2>/dev/null || true
done

# Wait for ports to clear
echo "Waiting for ports to clear..."
sleep 1

echo "Done."
