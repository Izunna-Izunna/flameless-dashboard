#!/usr/bin/env bash
# Launch Chromium in full-screen kiosk mode pointing at the dashboard.
# Flask (port 5000) serves both the API and the React build — single server.
set -eo pipefail

TARGET_URL="${FLAMELESS_URL:-http://localhost:5000}"

# Wait for X display to be available (up to 30s)
for i in $(seq 1 30); do
  xset q &>/dev/null && break
  echo "[flameless] Waiting for X display... ($i/30)"
  sleep 1
done

# Disable screen blanking / DPMS
xset s off
xset s noblank
xset -dpms 2>/dev/null || true

# Hide the mouse cursor after 3s idle
if command -v unclutter &>/dev/null; then
  unclutter -idle 3 -root &
fi

# Wait for Flask (port 5000) to be ready — serves both API and frontend
echo "[flameless] Waiting for Flask on port 5000..."
for i in $(seq 1 40); do
  python3 -c "import socket; s=socket.create_connection(('127.0.0.1',5000),1); s.close()" 2>/dev/null && break
  echo "[flameless]  not ready yet ($i/40)"
  sleep 1
done

echo "[flameless] Flask ready. Launching kiosk → $TARGET_URL"
exec chromium \
  --kiosk \
  --noerrdialogs \
  --disable-infobars \
  --disable-session-crashed-bubble \
  --disable-restore-session-state \
  --check-for-update-interval=31536000 \
  --no-first-run \
  --disable-translate \
  --disable-features=TranslateUI \
  --autoplay-policy=no-user-gesture-required \
  --incognito \
  --disk-cache-size=1 \
  --user-data-dir=/tmp/flameless-kiosk \
  --window-size=800,480 \
  --window-position=0,0 \
  "$TARGET_URL"
