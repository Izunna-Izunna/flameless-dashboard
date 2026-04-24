# FLAMELESS — Developer Reference

## What this is

A generator monitoring and control dashboard running on a Raspberry Pi 4B touchscreen kiosk.
The Pi is physically wired to a natural-gas generator and controls it via relay outputs.
A React dashboard runs in full-screen Chromium kiosk mode on the Pi's 800×480 display.
The same dashboard is accessible from any browser on the local network.

---

## Hardware

| Item | Detail |
|---|---|
| SBC | Raspberry Pi 4B, Debian Trixie (arm64) |
| Hostname | `Flameless` |
| Local IP | `10.179.202.139` (DHCP via wlan0 — may change) |
| Display | 800×480 DSI touchscreen (kiosk on `:0`) |
| OS user | `flameless` |
| Project root | `/home/flameless/flameless-dashboard/` |

### GPIO pin map (BCM numbering)

| GPIO | Direction | Component | Notes |
|---|---|---|---|
| 4 | Input (1-Wire) | DS18B20 temperature | kernel driver, not RPi.GPIO |
| 5 | Output | Spare relay (future expansion) | Rev 2.0: alarm buzzer removed; pin reserved |
| 17 | Output | Gas solenoid relay | active-HIGH |
| 18 | Output (PWM 50 Hz) | Choke servo | 5–10 % duty = 0–180° |
| 22 | Output | Engine-stop solenoid relay | active-HIGH |
| 23 | Input (PUD_DOWN) | MQ-4 gas sensor DO | HIGH = gas leak detected |
| 24 | Input (PUD_UP) | E-Stop button (NC) | HIGH = clear, LOW = pressed |
| 25 | Input (PUD_UP) | Hall-effect RPM sensor | interrupt-driven, 1 pulse/rev |
| 27 | Output | Starter motor relay | active-HIGH |

### I2C peripherals

| Address | Device | Purpose |
|---|---|---|
| 0x48 | ADS1115 (16-bit ADC) | **A0** = Toyota 89458-22010 pressure (ratiometric 0.5–4.5 V on 5 V supply, 0–10 bar) · **A1** = MQ-4 AO analog concentration (0–5 V) · **A2** = ZMPT101B AC voltage · **A3** = SCT-013 100 A CT clamp (AC current) |

### Relay logic
All relays are **active-HIGH**: drive GPIO HIGH to energise (ON), GPIO LOW to de-energise (OFF).
`RELAY_ACTIVE_LOW = False` in `gpio_interface.py`. If you swap to an active-LOW module, flip that flag.

### ADS1115 note
The ADS1115 is powered from the 5 V rail (via LLC), so `ADC_VCC = 5.0` in `gpio_interface.py`. All four channels are assigned per wiring diagram v2.0:
- **A0** – Pressure: Toyota/Lexus 89458-22010 ratiometric sensor (0.5–4.5 V = 0–10 bar)
- **A1** – MQ-4 AO: analog gas concentration output (0–5 V). Digital threshold also available via GPIO23 (MQ-4 DO).
- **A2** – ZMPT101B: AC voltage sensor. `ZMPT101B_SCALE` must be calibrated on-site with a multimeter.
- **A3** – SCT-013 100 A CT clamp: `SCT013_AMPS_PER_VOLT = 100.0` (for SCT-013-100 with built-in burden resistor). Adjust if using SCT-013-000.

The ADS1115 is currently disconnected for initial relay testing. `gpio_interface.py` handles this gracefully — Stage 2 (ADS1115) and Stage 3 (DS18B20) initialisation are wrapped independently so their failure does **not** prevent relay control (Stage 1 GPIO).

---

## Network addresses

| Address | What it serves |
|---|---|
| `http://10.179.202.139:5000/` | Dashboard — accessible from any browser on the LAN |
| `http://localhost:5000/` | Same, accessed from the Pi itself (kiosk) |
| `ws://10.179.202.139:5000/ws/sensors` | Live sensor WebSocket (2 s tick) |
| `ws://10.179.202.139:5000/ws/alerts` | Fault/alert WebSocket |
| `ws://10.179.202.139:5000/ws/state` | State-change WebSocket |
| `http://10.179.202.139:5000/api/...` | REST API (see API section below) |

The frontend uses relative paths (`/api/...`) for REST and `ws://${window.location.hostname}:5000/ws/sensors` for WebSocket, so it works from both the Pi's localhost and remote LAN access without any config change.

---

## Repository layout

```
flameless-dashboard/
├── backend/
│   ├── app.py                  ← Flask app, REST endpoints, WebSocket, sensor loop
│   ├── gpio_interface.py       ← Hardware detection, GPIO/I2C drivers, mode switch
│   ├── sensor_mock_v2.py       ← Pure-simulation state machine (no hardware needed)
│   ├── database.py             ← SQLite persistence (runs, faults, stats)
│   ├── config.py               ← Port, interval, history size env vars
│   └── .venv/                  ← Python virtualenv (Python 3.11+)
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Dashboard.tsx           ← Root component, loading overlay, screen router
│   │   │   ├── screens/
│   │   │   │   ├── HomeScreen.tsx      ← Live gauges and status
│   │   │   │   ├── ControlScreen.tsx   ← Start/Stop/E-Stop buttons, relay toggles
│   │   │   │   ├── SensorsScreen.tsx   ← Sensor readings with charts
│   │   │   │   ├── AlertsScreen.tsx    ← Active and historical faults
│   │   │   │   └── StatsScreen.tsx     ← Runtime, energy, maintenance stats
│   │   │   └── shared/
│   │   │       ├── Header.tsx          ← Top bar: state badge, connection dot
│   │   │       ├── Navigation.tsx      ← Bottom tab bar
│   │   │       └── ScrollButtons.tsx   ← Up/down arrows for touchscreen
│   │   ├── hooks/
│   │   │   ├── useWebSocket.ts   ← WebSocket client — delivers current + history
│   │   │   ├── useAlerts.ts      ← Polls /api/alerts/active every 5 s
│   │   │   ├── useGeneratorControl.ts  ← Wraps control API calls
│   │   │   └── useStats.ts       ← Polls stats endpoints
│   │   ├── services/
│   │   │   └── api.ts            ← Typed fetch wrappers for all REST endpoints
│   │   ├── types/
│   │   │   ├── sensor.ts         ← SensorReading, GeneratorState types
│   │   │   ├── control.ts        ← ControlStatus, PreCheck, ControlResponse types
│   │   │   ├── alert.ts          ← Alert/Fault types
│   │   │   └── stats.ts          ← Stats response types
│   │   └── styles/
│   │       └── theme.ts          ← Color palette, stateColor() helper
│   ├── dist/                     ← Vite production build (served by Flask)
│   └── package.json
└── scripts/
    └── start_kiosk.sh            ← Kiosk startup: waits for X + Flask, launches Chromium
```

---

## Architecture

```
Pi Boot
  │
  ├─► flameless-backend.service (systemd)
  │     └─ python3 app.py
  │          ├─ imports gpio_interface.py
  │          │    ├─ Stage 1: RPi.GPIO — relay outputs, digital inputs (HARDWARE_AVAILABLE)
  │          │    ├─ Stage 2: ADS1115 I2C — analog sensors (optional, graceful skip)
  │          │    └─ Stage 3: DS18B20 1-Wire — temperature (optional, graceful skip)
  │          ├─ sensor loop thread (every 2 s)
  │          │    └─ sensor.tick() → broadcast over WebSocket to all clients
  │          ├─ REST API  on :5000/api/...
  │          ├─ WebSocket on :5000/ws/...
  │          └─ serves frontend/dist/ (React build) as static files
  │
  └─► flameless-kiosk.service (systemd, 6 s after backend)
        └─ start_kiosk.sh
             ├─ waits for X display
             ├─ waits for port 5000 to accept connections (up to 40 s)
             └─ launches Chromium --kiosk --incognito → http://localhost:5000
```

The frontend is a **single-page React app**. Flask serves `dist/index.html` for every non-API route. The WebSocket hook (`useWebSocket.ts`) connects to `ws://{hostname}:5000/ws/sensors` and pushes live `SensorReading` objects into React state every 2 seconds.

---

## Generator state machine

States: `STOPPED → STARTING → RUNNING → STOPPING → FAULT`

| State | Duration | What happens |
|---|---|---|
| STOPPED | Idle | All relays off, RPM = 0, engine cools |
| STARTING | ~16 s (8 ticks × 2 s) | Starter relay ON, gas solenoid opens at 300 RPM, RPM ramps to ~1500 |
| RUNNING | Until stopped | Gas/electrical output live, hardware fault watchdog active |
| STOPPING | 60 s (30 ticks × 2 s) | Gas solenoid closes, RPM coasts down, cooldown |
| FAULT | Until reset | All outputs off except alarm buzzer |

The state machine lives in `sensor_mock_v2.py` (`EnhancedSensorGenerator`). In hardware mode, `gpio_interface.py` subclasses it and overlays real sensor readings on top of `super().tick()`. In simulation mode the subclass's tick() still runs but skips all GPIO I/O.

### Pre-start checks (must all pass before START is allowed)
1. E-Stop clear (GPIO24 HIGH)
2. No gas leak (GPIO23 LOW)
3. Engine temp < 90 °C
4. Gas pressure available
5. State is STOPPED

---

## REST API

All endpoints are under `/api`. The frontend uses relative paths so no hostname needed.

| Method | Path | Description |
|---|---|---|
| GET | `/api/sensors/current` | Latest `SensorReading` JSON |
| GET | `/api/sensors/history` | Last 150 readings array |
| POST | `/api/control/start` | Start the generator |
| POST | `/api/control/stop` | Normal stop (60 s cooldown) |
| POST | `/api/control/estop` | Emergency stop → FAULT immediately |
| POST | `/api/control/reset` | Clear FAULT → STOPPED |
| GET | `/api/control/status` | Pre-checks, all_checks_pass, stop_ticks_remaining |
| POST | `/api/control/relay/<name>` | Toggle relay manually (`starter`, `gas`, `alarm`) body: `{"state": true}` |
| GET | `/api/alerts/active` | Unacknowledged fault list |
| GET | `/api/alerts/history?limit=N` | Historical faults |
| POST | `/api/alerts/acknowledge` | Mark fault acknowledged body: `{"id": N}` |
| GET | `/api/diagnostics/health` | Pi CPU/memory/temp stats |
| GET | `/api/stats/runtime` | Total run hours, start count |
| GET | `/api/stats/energy` | Energy output history |
| GET | `/api/stats/efficiency` | Efficiency stats |
| GET | `/api/stats/maintenance` | Maintenance schedule |
| GET | `/api/export/sensors/csv` | Download sensor history as CSV |
| GET | `/api/export/faults/csv` | Download fault log as CSV |
| GET | `/api/system/mode` | `{simulation_mode, hardware_available}` |
| POST | `/api/system/mode` | Switch mode body: `{"simulation": true/false}` |
| POST | `/api/system/exit-kiosk` | Stop the kiosk (systemctl stop flameless-kiosk) |
| GET | `/health` | Quick health check |

---

## systemd services

### `flameless-backend.service`
```
ExecStart: /home/flameless/flameless-dashboard/backend/.venv/bin/python3 app.py
WorkingDirectory: /home/flameless/flameless-dashboard/backend
User: flameless
Environment: FLAMELESS_HOST=0.0.0.0, FLAMELESS_PORT=5000
Restart: always, RestartSec=5
After: local-fs.target network.target
```

### `flameless-kiosk.service`
```
ExecStartPre: /bin/sleep 6
ExecStart: /home/flameless/flameless-dashboard/scripts/start_kiosk.sh
User: flameless
Environment: DISPLAY=:0, XAUTHORITY=/home/flameless/.Xauthority
Restart: on-failure, RestartSec=10
After: graphical.target flameless-backend.service
```

Useful commands:
```bash
sudo systemctl status flameless-backend
sudo systemctl status flameless-kiosk
sudo systemctl restart flameless-backend
sudo systemctl restart flameless-kiosk
sudo journalctl -u flameless-backend -f        # live backend logs
sudo journalctl -u flameless-kiosk  -f        # live kiosk logs
```

---

## Simulation vs hardware mode

`gpio_interface.py` has two code paths selected at import time:

- **No hardware** (`RPi.GPIO` import fails) → `EnhancedSensorGenerator` is a direct alias of the mock. `simulation_mode: true` in every reading.
- **Hardware present** (`HARDWARE_AVAILABLE = True`) → `EnhancedSensorGenerator` subclasses the mock, runs real GPIO I/O in `tick()`, and reports `simulation_mode: false`.

The mode can be toggled at runtime via `POST /api/system/mode {"simulation": true/false}` without restarting. The toggle button is on the Control screen. You cannot switch to real hardware mode if `HARDWARE_AVAILABLE` is false (i.e. GPIO never initialised).

---

## Frontend development

```bash
cd /home/flameless/flameless-dashboard/frontend
npm install          # install dependencies (Node v20 via NVM)
npm run dev          # Vite dev server on :3000 (proxies /api to :5000)
npm run build        # production build → dist/   (served by Flask)
```

**After any frontend change you must rebuild** (`npm run build`) so Flask serves the new files. The kiosk picks up new builds automatically on next restart because Chromium starts in `--incognito` mode (no disk cache).

Tech stack: React 18, TypeScript, Vite. No UI library — all styles are inline `style={{}}` objects using the theme palette from `src/styles/theme.ts`.

---

## Bugs fixed (history)

### 1 — Blank screen on load (`useWebSocket.ts` was empty)
`src/hooks/useWebSocket.ts` was a 0-byte file. `Dashboard.tsx` imports it and destructures `{ current, history, connected }`. With no hook, `current` was always `null`, so `showLoading = !current || !minLoadDone` was permanently `true` and the loading overlay never cleared.

**Fix:** Wrote the full `useWebSocket.ts` — connects to `ws://${hostname}:5000/ws/sensors`, pushes JSON messages into `current` state, accumulates `history`, tracks `connected`, auto-reconnects every 3 s on close.

### 2 — Chromium caching broken JS on kiosk reboot
Even after rebuilding with the fix, Chromium on the touchscreen could load the stale `index.html` from its disk cache, which referenced the old (broken) JS bundle.

**Fix:** Added `--incognito`, `--disk-cache-size=1`, and `--user-data-dir=/tmp/flameless-kiosk` to the Chromium command in `start_kiosk.sh`. Chromium now always fetches fresh from Flask on every boot.

### 3 — Sensor loop thread dying silently
`_sensor_loop()` in `app.py` had no error handling around `sensor.tick()`. If `tick()` raised any exception, the thread terminated silently — no WebSocket data would ever be broadcast again, causing the same blank-screen symptom on subsequent connections.

**Fix:** Wrapped the loop body in `try/except Exception as e: log.error(...)` so exceptions are logged but the loop continues.

### 4 — E-Stop making START permanently unclickable
After an E-Stop the engine was at ~80 °C. The pre-start check required temp < 50 °C. Cooling rate was 0.02 °C/tick = ~35 minutes wait. START was disabled until temp dropped.

**Fix:** Raised pre-check threshold to 90 °C and cooling rates to 0.5 °C/tick (STOPPED) and 1.0 °C/tick (FAULT).

### 5 — Wrong ADS1115 channel assignments (Rev 2.0 wiring diagram update)
Original architecture doc and code assigned A0=pressure(4-20mA), A1=NTC thermistor, A2=ACS712-30A current, A3=step-down voltage. The Rev 2.0 wiring diagram uses different sensors on every analog channel, and the actual installed hardware differs from the original design.

**Correct assignments per wiring diagram v2.0 (authoritative):**
- A0: Toyota/Lexus 89458-22010 pressure transducer — ratiometric voltage (0.5–4.5 V), NOT 4-20 mA
- A1: MQ-4 analog out (0–5 V gas concentration) — NTC thermistor was never installed
- A2: ZMPT101B AC voltage sensor — replaces original step-down transformer design
- A3: SCT-013 100 A CT clamp — replaces ACS712-30A hall-effect IC

**Fix:** Updated `gpio_interface.py` — corrected all channel assignments, replaced 4-20 mA pressure math with ratiometric formula, removed NTC thermistor code, replaced ACS712 math with SCT-013 CT calibration, replaced `VOLTAGE_SCALE` with `ZMPT101B_SCALE`. Relay 4 (GPIO5) renamed from `PIN_ALARM` to `PIN_SPARE`; buzzer removed in Rev 2.0.

### 6 — All relays energising at boot (active-LOW modules)
For active-LOW relay modules, GPIO LOW = relay ON. Initial state `_GPIO.LOW` was energising all relays (gas valve open, starter running) on every boot.

**Fix:** `_init_relay = _GPIO.HIGH if RELAY_ACTIVE_LOW else _GPIO.LOW`. For the current active-HIGH setup `RELAY_ACTIVE_LOW = False`, so relays initialise LOW (off). Change `RELAY_ACTIVE_LOW = True` if you ever switch back to an active-LOW module.

### 7 — ADS1115 failure blocking relay control
All hardware init was one giant `try/except`. If ADS1115 was not connected, the exception fired before GPIO was initialised, leaving `HARDWARE_AVAILABLE = False` and relays non-functional.

**Fix:** Split into three independent stages. Stage 1 (GPIO) must succeed for `HARDWARE_AVAILABLE = True`. Stages 2 (ADS1115) and 3 (DS18B20) are individually wrapped — their failure logs a warning but does not block relay control.

---

## Making changes

**Backend change** (Python):
```bash
# edit file, then:
sudo systemctl restart flameless-backend
sudo journalctl -u flameless-backend -f     # watch for errors
```

**Frontend change** (React/TypeScript):
```bash
cd /home/flameless/flameless-dashboard/frontend
# edit file, then:
npm run build
sudo systemctl restart flameless-kiosk      # kiosk picks up new build
# or just reload the tab in any browser — no restart needed for browser access
```

**GPIO pin change**: Edit the `PIN_*` constants at the top of `gpio_interface.py`. Restart backend.

**Add a new relay**: Add a `PIN_NEW = <gpio>` constant, set it up in the try block (`_GPIO.setup(PIN_NEW, _GPIO.OUT, initial=_init_relay)`), add a branch in `toggle_relay()` and `_sync_relays()`.

**Add a new sensor reading**: Add the read call in the hardware `tick()` overlay in `gpio_interface.py`, add the field to `SensorReading` in `frontend/src/types/sensor.ts`, rebuild frontend.
