#!/usr/bin/env bash
# One-time setup: install Python deps, build frontend, install & enable systemd services.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$SCRIPT_DIR/.."
BACKEND_DIR="$PROJECT_DIR/backend"
FRONTEND_DIR="$PROJECT_DIR/frontend"
SYSTEMD_SRC="$PROJECT_DIR/systemd"
SYSTEMD_DST="/etc/systemd/system"

echo "=== FLAMELESS Dashboard Setup ==="

# 1. Python virtual environment
echo "[1/5] Setting up Python virtual environment..."
cd "$BACKEND_DIR"
python3 -m venv .venv
source .venv/bin/activate
pip install -q -r requirements.txt
deactivate

# 2. npm install + production build
echo "[2/5] Building frontend..."
cd "$FRONTEND_DIR"
npm install
npm run build

# 3. Install serve for static file serving
echo "[3/5] Installing 'serve' (static file server)..."
npm install -g serve 2>/dev/null || true

# 4. Copy systemd units
echo "[4/5] Installing systemd service units..."
sudo cp "$SYSTEMD_SRC/flameless-backend.service"  "$SYSTEMD_DST/"
sudo cp "$SYSTEMD_SRC/flameless-frontend.service" "$SYSTEMD_DST/"
sudo cp "$SYSTEMD_SRC/flameless-kiosk.service"    "$SYSTEMD_DST/"
sudo systemctl daemon-reload

# 5. Enable & start services
echo "[5/5] Enabling services..."
sudo systemctl enable --now flameless-backend.service
sudo systemctl enable --now flameless-frontend.service
sudo systemctl enable --now flameless-kiosk.service

echo ""
echo "=== Setup complete ==="
echo "Backend  → http://localhost:5000"
echo "Frontend → http://localhost:3000"
echo "Run 'systemctl status flameless-*' to check status."
