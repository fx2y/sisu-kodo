#!/bin/bash
set -euo pipefail

# Stop worker and shim processes
echo "Stopping worker and api-shim processes..."
pkill -f "dist/worker/main.js" || true
pkill -f "dist/api-shim/main.js" || true

# Wait for ports to clear
echo "Waiting for ports to clear..."
sleep 1

echo "Done."
