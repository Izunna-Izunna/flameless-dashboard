#!/usr/bin/env bash
# Build (if needed) and serve the FLAMELESS React frontend
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$SCRIPT_DIR/../frontend"

cd "$FRONTEND_DIR"

# Install npm deps if node_modules missing
if [ ! -d node_modules ]; then
  echo "[flameless] Installing npm dependencies..."
  npm install
fi

# Build production bundle
echo "[flameless] Building production bundle..."
npm run build

# Serve the dist folder with a lightweight static server
# Use 'serve' if available, else fall back to Python http.server
if command -v serve &>/dev/null; then
  echo "[flameless] Serving on http://0.0.0.0:3000 (serve)"
  exec serve -s dist -l 3000
else
  echo "[flameless] Serving on http://0.0.0.0:3000 (python http.server)"
  cd dist
  exec python3 -m http.server 3000 --bind 0.0.0.0
fi
