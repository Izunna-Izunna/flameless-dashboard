#!/usr/bin/env bash
# Start the FLAMELESS Flask backend
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/../backend"
VENV_DIR="$BACKEND_DIR/.venv"

cd "$BACKEND_DIR"

# Create venv if missing
if [ ! -d "$VENV_DIR" ]; then
  echo "[flameless] Creating Python virtual environment..."
  python3 -m venv "$VENV_DIR"
fi

source "$VENV_DIR/bin/activate"
pip install -q -r requirements.txt

echo "[flameless] Starting backend on http://0.0.0.0:5000"
exec python3 app.py
