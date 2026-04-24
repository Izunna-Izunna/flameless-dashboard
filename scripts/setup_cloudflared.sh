#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# FLAMELESS – Cloudflare Tunnel setup script for Raspberry Pi
# Run once on the Pi after cloudflared is installed.
#
# Usage:
#   chmod +x scripts/setup_cloudflared.sh
#   ./scripts/setup_cloudflared.sh
# ─────────────────────────────────────────────────────────────────────────────
set -e

TUNNEL_NAME="flameless-pi"
SERVICE_SRC="$(dirname "$0")/../systemd/cloudflared.service"
SERVICE_DST="/etc/systemd/system/cloudflared.service"

echo "=== FLAMELESS Cloudflare Tunnel Setup ==="
echo ""

# ── 1. Authenticate ──────────────────────────────────────────────────────────
echo "[1/4] Authenticating with Cloudflare (browser will open)..."
cloudflared tunnel login

# ── 2. Create tunnel ─────────────────────────────────────────────────────────
echo ""
echo "[2/4] Creating tunnel: ${TUNNEL_NAME}"
cloudflared tunnel create "${TUNNEL_NAME}"

TUNNEL_ID=$(cloudflared tunnel list | grep "${TUNNEL_NAME}" | awk '{print $1}')
echo "      Tunnel ID: ${TUNNEL_ID}"

# ── 3. Write config.yml ──────────────────────────────────────────────────────
echo ""
echo "[3/4] Writing ~/.cloudflared/config.yml"
mkdir -p ~/.cloudflared
cat > ~/.cloudflared/config.yml <<EOF
tunnel: ${TUNNEL_ID}
credentials-file: /home/${USER}/.cloudflared/${TUNNEL_ID}.json

ingress:
  # Flask backend
  - service: http://localhost:5000
    originRequest:
      connectTimeout: 30s
      noTLSVerify: true
  # Catch-all (required)
  - service: http_status:404
EOF

echo "      Config written to ~/.cloudflared/config.yml"
echo ""
echo "      ┌─────────────────────────────────────────────────────┐"
echo "      │ IMPORTANT: Copy the hostname below and set it as    │"
echo "      │ BACKEND_URL in worker/wrangler.toml                 │"
echo "      │                                                     │"
echo "      │ Then run: cloudflared tunnel route dns ${TUNNEL_NAME} │"
echo "      │           <your-chosen-hostname>                    │"
echo "      └─────────────────────────────────────────────────────┘"
echo ""

# ── 4. Install systemd service ───────────────────────────────────────────────
echo "[4/4] Installing systemd service..."
sudo cp "${SERVICE_SRC}" "${SERVICE_DST}"
sudo systemctl daemon-reload
sudo systemctl enable cloudflared
sudo systemctl start cloudflared

echo ""
echo "=== Done! Tunnel is running. ==="
echo ""
echo "Verify with:"
echo "  sudo systemctl status cloudflared"
echo "  cloudflared tunnel info ${TUNNEL_NAME}"
