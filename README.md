# FLAMELESS Generator Monitoring Dashboard

Real-time monitoring dashboard for the FLAMELESS flare gas-to-electricity generator.
Designed for Raspberry Pi 4B + 7" touchscreen (800×480).

---

## Quick Start (Development)

### 1. Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python3 app.py
# → http://localhost:5000
```

### 2. Frontend (dev server with HMR)

```bash
cd frontend
npm install
npm run dev
# → http://localhost:3000
```

Open `http://localhost:3000` in a browser – the dashboard updates live every 2 seconds.

---

## Production Deployment (Raspberry Pi)

Run the one-shot setup script (requires `sudo` for systemd):

```bash
cd /home/flameless/flameless-dashboard
bash scripts/setup_autostart.sh
```

This will:
1. Create a Python virtualenv and install deps
2. Build the React bundle (`frontend/dist/`)
3. Copy and enable three systemd services:
   - `flameless-backend.service`  — Flask API on :5000
   - `flameless-frontend.service` — Static file server on :3000
   - `flameless-kiosk.service`    — Chromium in kiosk mode

After setup, the dashboard launches automatically on every boot.

### Managing services

```bash
systemctl status flameless-*
sudo systemctl restart flameless-backend
journalctl -u flameless-backend -f     # live logs
```

---

## Project Structure

```
flameless-dashboard/
├── backend/
│   ├── app.py           Flask server + WebSocket broadcaster
│   ├── sensor_mock.py   Realistic correlated sensor data generator
│   ├── config.py        Port / interval / CORS settings
│   └── requirements.txt
├── frontend/
│   └── src/
│       ├── components/
│       │   ├── Dashboard.tsx   Layout orchestrator
│       │   ├── Gauge.tsx       SVG semi-circular gauge
│       │   ├── PowerChart.tsx  Recharts area chart
│       │   ├── MetricsBar.tsx  Secondary metrics row
│       │   ├── Header.tsx      Logo + clock + status
│       │   └── StatusBar.tsx   Footer status + alerts
│       ├── hooks/
│       │   └── useWebSocket.ts Auto-reconnecting WS hook
│       ├── styles/theme.ts     Colour palette + gauge ranges
│       └── types/sensor.ts     SensorReading TypeScript interface
├── scripts/
│   ├── start_backend.sh
│   ├── start_frontend.sh
│   ├── start_kiosk.sh
│   └── setup_autostart.sh
└── systemd/
    ├── flameless-backend.service
    ├── flameless-frontend.service
    └── flameless-kiosk.service
```

---

## Simulated Sensors

| Parameter         | Range          | Target     |
|-------------------|----------------|------------|
| Gas Pressure      | 15–30 PSI      | 22.5 PSI   |
| Flow Rate         | 0.5–5 MMSCFD   | 2.8 MMSCFD |
| Temperature       | 60–85 °C       | 72 °C      |
| Power Output      | 200–280 kW     | 250 kW     |
| Voltage (3-phase) | 400–430 V      | 415 V      |
| Efficiency        | 35–40 %        | 37.5 %     |
| CO₂ saved         | cumulative     | 14 kt/year |

All parameters are correlated (flow → power → temperature → efficiency).
A 10 % random chance of injecting an alert message each tick.

---

## Environment Variables (backend)

| Variable          | Default   | Description                    |
|-------------------|-----------|--------------------------------|
| `FLAMELESS_HOST`  | `0.0.0.0` | Bind address                   |
| `FLAMELESS_PORT`  | `5000`    | Port                           |
| `SENSOR_INTERVAL` | `2.0`     | Seconds between readings       |
| `HISTORY_SIZE`    | `150`     | Max readings kept in memory    |

## Environment Variables (frontend)

| Variable        | Default                              | Description         |
|-----------------|--------------------------------------|---------------------|
| `VITE_WS_URL`   | `ws://<host>:5000/ws/sensors`        | WebSocket endpoint  |
