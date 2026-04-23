"""
FLAMELESS Generator Monitoring – Enhanced Flask Backend v2
Full control API + state machine + WebSocket broadcasting + SQLite persistence.
"""
import csv
import io
import json
import logging
import threading
import time
from collections import deque
from datetime import datetime, timezone

import os
from flask import Flask, jsonify, request, Response, send_from_directory
from flask_cors import CORS
from flask_sock import Sock

import database as db
from config import CORS_ORIGINS, HISTORY_SIZE, HOST, PORT, SENSOR_INTERVAL
from gpio_interface import EnhancedSensorGenerator, set_simulation_mode, get_mode

# ─── Logging ─────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger(__name__)

# ─── App ─────────────────────────────────────────────────────────────────────
FRONTEND_DIST = os.path.join(os.path.dirname(__file__), '..', 'frontend', 'dist')

app = Flask(__name__, static_folder=FRONTEND_DIST, static_url_path='')
CORS(app, origins=CORS_ORIGINS)
sock = Sock(app)

# ─── Shared state ────────────────────────────────────────────────────────────
sensor = EnhancedSensorGenerator()
history: deque = deque(maxlen=HISTORY_SIZE)
_current: dict = {}
_prev_state: str = "STOPPED"
_run_id: int | None = None

_lock = threading.Lock()
_clients_lock = threading.Lock()

_ws_sensors: set = set()
_ws_alerts: set = set()
_ws_state: set = set()

_last_control_time: float = 0.0   # rate-limit guard

# ─── Broadcast helpers ────────────────────────────────────────────────────────
def _broadcast(client_set: set, payload: str):
    with _clients_lock:
        dead = set()
        for ws in list(client_set):
            try:
                ws.send(payload)
            except Exception:
                dead.add(ws)
        client_set -= dead


def _register(ws, client_set: set):
    with _clients_lock:
        client_set.add(ws)


def _unregister(ws, client_set: set):
    with _clients_lock:
        client_set.discard(ws)

# ─── Sensor loop ─────────────────────────────────────────────────────────────
def _sensor_loop():
    global _current, _prev_state, _run_id
    log.info("Sensor loop started (%.1fs interval)", SENSOR_INTERVAL)

    while True:
        try:
            reading = sensor.tick()
            new_state = reading["state"]

            with _lock:
                _current = reading
                history.append(dict(reading))

            payload = json.dumps(reading)
            _broadcast(_ws_sensors, payload)

            # State change notifications
            if new_state != _prev_state:
                log.info("State change: %s → %s", _prev_state, new_state)
                state_payload = json.dumps({"state": new_state, "previous": _prev_state,
                                            "timestamp": reading["timestamp"]})
                _broadcast(_ws_state, state_payload)

                # Track run sessions
                if new_state == "RUNNING" and _prev_state == "STARTING":
                    _run_id = db.start_run(reading["timestamp"])
                elif _prev_state == "RUNNING" and new_state in ("STOPPING", "FAULT", "STOPPED"):
                    if _run_id is not None:
                        db.end_run(_run_id, reading["timestamp"],
                                   sensor.get_run_energy(), reading.get("fuel_m3_used", 0),
                                   reading.get("power_kw", 0))
                        _run_id = None

                _prev_state = new_state

            # Alert broadcasting
            alert = reading.get("alert") or reading.get("fault_reason")
            if alert and new_state == "FAULT":
                db.log_fault(alert, None, None, None, new_state)
                _broadcast(_ws_alerts, json.dumps({"alert": alert, "state": new_state,
                                                    "timestamp": reading["timestamp"]}))
        except Exception as e:
            log.error("Sensor loop error: %s", e, exc_info=True)

        time.sleep(SENSOR_INTERVAL)


threading.Thread(target=_sensor_loop, daemon=True).start()

# ─── Rate limiter ─────────────────────────────────────────────────────────────
def _check_rate_limit() -> bool:
    global _last_control_time
    now = time.time()
    if now - _last_control_time < 2.0:
        return False
    _last_control_time = now
    return True

# ─── REST: sensors ────────────────────────────────────────────────────────────
@app.get("/api/sensors/current")
def get_current():
    with _lock:
        if not _current:
            return jsonify({"error": "No data yet"}), 503
        return jsonify(_current)


@app.get("/api/sensors/history")
def get_history():
    with _lock:
        return jsonify(list(history))


@app.get("/api/system/status")
def get_system_status():
    with _lock:
        r = _current or {}
    return jsonify({
        "status": r.get("state", "UNKNOWN"),
        "alert": r.get("alert"),
        "uptime_hours": r.get("uptime_hours", 0),
        "co2_saved_tonnes": r.get("co2_saved_tonnes", 0),
    })

# ─── REST: control ────────────────────────────────────────────────────────────
@app.post("/api/control/start")
def control_start():
    if not _check_rate_limit():
        return jsonify({"success": False, "message": "Rate limited — wait 2s"}), 429
    result = sensor.start_generator()
    return jsonify(result)


@app.post("/api/control/stop")
def control_stop():
    if not _check_rate_limit():
        return jsonify({"success": False, "message": "Rate limited — wait 2s"}), 429
    result = sensor.stop_generator()
    return jsonify(result)


@app.post("/api/control/estop")
def control_estop():
    # E-Stop bypasses rate limiter — safety critical
    result = sensor.estop()
    db.log_fault("E-Stop activated", None, None, None, sensor.get_state())
    return jsonify(result)


@app.post("/api/control/reset")
def control_reset():
    if not _check_rate_limit():
        return jsonify({"success": False, "message": "Rate limited — wait 2s"}), 429
    result = sensor.reset_fault()
    return jsonify(result)


@app.get("/api/control/status")
def control_status():
    with _lock:
        r = _current or {}
    checks = sensor.get_pre_checks()
    return jsonify({
        "state": r.get("state", "STOPPED"),
        "pre_checks": checks,
        "all_checks_pass": all(c["passed"] for c in checks),
        "stop_ticks_remaining": r.get("stop_ticks_remaining"),
    })


@app.post("/api/control/relay/<relay_name>")
def control_relay(relay_name: str):
    body = request.get_json(silent=True) or {}
    state = bool(body.get("state", False))
    result = sensor.toggle_relay(relay_name, state)
    return jsonify(result)

# ─── REST: alerts ─────────────────────────────────────────────────────────────
@app.get("/api/alerts/active")
def alerts_active():
    return jsonify(db.get_active_faults())


@app.get("/api/alerts/history")
def alerts_history():
    limit = int(request.args.get("limit", 50))
    return jsonify(db.get_fault_history(limit))


@app.post("/api/alerts/acknowledge")
def alerts_acknowledge():
    body = request.get_json(silent=True) or {}
    fault_id = body.get("id")
    if fault_id is None:
        return jsonify({"error": "Missing id"}), 400
    db.acknowledge_fault(int(fault_id))
    return jsonify({"success": True})

# ─── REST: diagnostics ────────────────────────────────────────────────────────
@app.get("/api/diagnostics/health")
def diagnostics_health():
    return jsonify(db.get_pi_health())

# ─── REST: stats ──────────────────────────────────────────────────────────────
@app.get("/api/stats/runtime")
def stats_runtime():
    return jsonify(db.get_runtime_stats())


@app.get("/api/stats/energy")
def stats_energy():
    days = int(request.args.get("days", 30))
    return jsonify(db.get_energy_history(days))


@app.get("/api/stats/efficiency")
def stats_efficiency():
    return jsonify(db.get_efficiency_stats())


@app.get("/api/stats/maintenance")
def stats_maintenance():
    return jsonify(db.get_maintenance_schedule())

# ─── REST: export ─────────────────────────────────────────────────────────────
@app.get("/api/export/sensors/csv")
def export_sensors():
    with _lock:
        data = list(history)
    csv_str = db.export_sensors_csv(data)
    return Response(csv_str, mimetype="text/csv",
                    headers={"Content-Disposition": "attachment; filename=sensors.csv"})


@app.get("/api/export/faults/csv")
def export_faults():
    csv_str = db.export_faults_csv()
    return Response(csv_str, mimetype="text/csv",
                    headers={"Content-Disposition": "attachment; filename=faults.csv"})

# ─── Health ───────────────────────────────────────────────────────────────────
@app.get("/health")
def health():
    return jsonify({"ok": True, "state": sensor.get_state()})

# ─── System / Kiosk / Mode ────────────────────────────────────────────────────
@app.post("/api/system/exit-kiosk")
def exit_kiosk():
    """Kill the Chromium kiosk process so the user returns to the desktop."""
    import subprocess
    subprocess.Popen(["/usr/bin/sudo", "/usr/bin/systemctl", "stop", "flameless-kiosk"])
    return jsonify({"ok": True, "message": "Kiosk exiting…"})

@app.get("/api/system/mode")
def system_mode():
    return jsonify(get_mode())

@app.post("/api/system/mode")
def set_system_mode():
    body = request.get_json(silent=True) or {}
    enabled = body.get("simulation", True)
    result = set_simulation_mode(bool(enabled))
    return jsonify(result), (200 if result["ok"] else 409)

# ─── Frontend (catch-all) ─────────────────────────────────────────────────────
@app.get('/')
@app.get('/<path:path>')
def serve_frontend(path=''):
    """Serve the React production build for all non-API routes."""
    full = os.path.join(FRONTEND_DIST, path)
    if path and os.path.exists(full):
        return send_from_directory(FRONTEND_DIST, path)
    return send_from_directory(FRONTEND_DIST, 'index.html')

# ─── WebSockets ───────────────────────────────────────────────────────────────
@sock.route("/ws/sensors")
def ws_sensors(ws):
    _register(ws, _ws_sensors)
    with _lock:
        if _current:
            ws.send(json.dumps(_current))
    try:
        while True:
            msg = ws.receive(timeout=30)
            if msg is None:
                break
    except Exception:
        pass
    finally:
        _unregister(ws, _ws_sensors)


@sock.route("/ws/alerts")
def ws_alerts_endpoint(ws):
    _register(ws, _ws_alerts)
    try:
        while True:
            msg = ws.receive(timeout=60)
            if msg is None:
                break
    except Exception:
        pass
    finally:
        _unregister(ws, _ws_alerts)


@sock.route("/ws/state")
def ws_state_endpoint(ws):
    _register(ws, _ws_state)
    with _lock:
        if _current:
            ws.send(json.dumps({"state": _current.get("state"), "timestamp": _current.get("timestamp")}))
    try:
        while True:
            msg = ws.receive(timeout=60)
            if msg is None:
                break
    except Exception:
        pass
    finally:
        _unregister(ws, _ws_state)

# ─── Entry point ──────────────────────────────────────────────────────────────
if __name__ == "__main__":
    log.info("Starting FLAMELESS backend v2 on %s:%s", HOST, PORT)
    app.run(host=HOST, port=PORT, debug=False)
