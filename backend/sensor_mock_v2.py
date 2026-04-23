"""
FLAMELESS Generator – Enhanced Sensor Generator v2
Full state machine: STOPPED → STARTING → RUNNING → STOPPING → FAULT
Simulates all IoT sensors from the wiring diagram (no real GPIO required).
"""
import math, random, time, threading
from datetime import datetime, timezone

GeneratorState = str  # 'STOPPED' | 'STARTING' | 'RUNNING' | 'STOPPING' | 'FAULT'

ALERT_THRESHOLDS = {
    "temp_warning": 85, "temp_critical": 95,
    "pressure_low": 3.0, "pressure_high": 7.0,
    "rpm_low": 1400, "rpm_high": 1800,
    "voltage_low": 210, "voltage_high": 240,
}

class EnhancedSensorGenerator:
    def __init__(self):
        self._lock = threading.Lock()
        self._state: GeneratorState = "STOPPED"
        self._start_time = time.time()
        self._run_start: float | None = None

        # Continuous sensors
        self._rpm = 0.0
        self._temp_c = 25.0          # ambient when stopped
        self._pressure_bar = 0.0
        self._voltage_v = 0.0
        self._current_a = 0.0
        self._power_kw = 0.0

        # Digital I/O (simulated)
        self._gas_leak = False
        self._estop_active = False
        self._starter_relay = False
        self._gas_solenoid = False
        self._alarm_buzzer = False

        # Accumulators
        self._co2_kg = 0.0
        self._fuel_m3 = 0.0
        self._start_count = 0
        self._uptime_hours = 0.0
        self._run_energy_kwh = 0.0

        # State transition counters
        self._phase_tick = 0
        self._stop_ticks = 0
        self._fault_reason: str | None = None

        # Slow drift phases for RUNNING noise
        self._phase = {k: random.uniform(0, 2 * math.pi) for k in ["rpm", "temp", "volt", "load"]}

        self._last_tick = time.time()

    # ── helpers ──────────────────────────────────────────────────────────────
    def _noise(self, amplitude: float) -> float:
        return random.gauss(0, amplitude)

    def _clamp(self, v, lo, hi):
        return max(lo, min(hi, v))

    def _advance_phase(self):
        for k in self._phase:
            self._phase[k] += random.uniform(0.03, 0.07)

    # ── pre-checks ────────────────────────────────────────────────────────────
    def get_pre_checks(self) -> list:
        return [
            {"name": "E-Stop Clear",         "passed": not self._estop_active, "detail": "E-Stop button not engaged"},
            {"name": "No Gas Leak",           "passed": not self._gas_leak,     "detail": "MQ-4 sensor reading normal"},
            {"name": "Engine Cool (<50°C)",   "passed": self._temp_c < 50,      "detail": f"Engine temp: {self._temp_c:.1f}°C"},
            {"name": "Gas Pressure Available","passed": True,                   "detail": "Simulation mode: pressure OK"},
            {"name": "State is STOPPED",      "passed": self._state == "STOPPED","detail": f"Current state: {self._state}"},
        ]

    def _all_checks_pass(self) -> tuple[bool, str]:
        for c in self.get_pre_checks():
            if not c["passed"]:
                return False, c["name"] + " failed: " + c["detail"]
        return True, "All checks passed"

    # ── control commands ──────────────────────────────────────────────────────
    def start_generator(self) -> dict:
        with self._lock:
            ok, msg = self._all_checks_pass()
            if not ok:
                return {"success": False, "message": msg}
            self._state = "STARTING"
            self._phase_tick = 0
            self._starter_relay = True
            self._start_count += 1
            self._run_start = time.time()
            self._run_energy_kwh = 0.0
            return {"success": True, "message": "Starting generator…", "state": "STARTING"}

    def stop_generator(self) -> dict:
        with self._lock:
            if self._state != "RUNNING":
                return {"success": False, "message": f"Cannot stop from state {self._state}"}
            self._state = "STOPPING"
            self._gas_solenoid = False
            self._phase_tick = 0
            self._stop_ticks = 30   # 30 ticks × 2s = 60s cooldown
            return {"success": True, "message": "Stopping generator — 60s cooldown…", "state": "STOPPING"}

    def estop(self) -> dict:
        with self._lock:
            self._fault_reason = "E-Stop activated"
            self._go_fault()
            return {"success": True, "message": "EMERGENCY STOP — immediate shutdown", "state": "FAULT"}

    def reset_fault(self) -> dict:
        with self._lock:
            if self._state != "FAULT":
                return {"success": False, "message": f"Not in FAULT state (currently {self._state})"}
            self._state = "STOPPED"
            self._alarm_buzzer = False
            self._fault_reason = None
            return {"success": True, "message": "Fault cleared — ready to start", "state": "STOPPED"}

    def toggle_relay(self, relay: str, state: bool) -> dict:
        with self._lock:
            if relay == "starter":
                self._starter_relay = state
            elif relay == "gas":
                self._gas_solenoid = state
            elif relay == "alarm":
                self._alarm_buzzer = state
            else:
                return {"success": False, "message": f"Unknown relay: {relay}"}
            return {"success": True, "message": f"{relay} relay set to {'ON' if state else 'OFF'}"}

    # ── state machine internals ───────────────────────────────────────────────
    def _go_fault(self):
        """Immediate shutdown — call inside lock."""
        self._state = "FAULT"
        self._starter_relay = False
        self._gas_solenoid = False
        self._alarm_buzzer = True
        self._voltage_v = 0.0
        self._current_a = 0.0
        self._power_kw = 0.0

    def _tick_stopped(self, dt: float):
        self._rpm = 0.0
        self._pressure_bar = 0.0
        self._voltage_v = 0.0
        self._current_a = 0.0
        self._power_kw = 0.0
        self._temp_c = max(25.0, self._temp_c - 0.02)   # cool to ambient

    def _tick_starting(self, dt: float):
        t = self._phase_tick
        if t < 4:
            # Cranking: RPM ramps 0 → 500
            self._rpm = self._clamp(self._rpm + 30 + self._noise(5), 0, 500)
            self._pressure_bar = 0.0
            if self._rpm > 300:
                self._gas_solenoid = True
        elif t < 8:
            # Ignition caught: RPM ramps 500 → 1500
            self._rpm = self._clamp(self._rpm + 80 + self._noise(15), 0, 1510)
            self._pressure_bar = self._clamp(t * 0.5 + self._noise(0.1), 0, 4.0)
            self._temp_c = min(self._temp_c + 1.5, 55.0)
        else:
            # Stable: transition to RUNNING
            self._starter_relay = False
            self._rpm = self._clamp(1490 + self._noise(10), 1480, 1510)
            self._state = "RUNNING"
        self._phase_tick += 1

    def _tick_running(self, dt: float):
        self._advance_phase()

        # RPM jitter around 1490
        self._rpm = self._clamp(
            1490 + 8 * math.sin(self._phase["rpm"]) + self._noise(3),
            1450, 1520
        )
        # Temperature rises slowly to 70-85°C with load coupling
        target_temp = 75 + 5 * math.sin(self._phase["load"])
        self._temp_c += (target_temp - self._temp_c) * 0.05 + self._noise(0.3)
        self._temp_c = self._clamp(self._temp_c, 65, 92)

        # Pressure 4-5 bar
        self._pressure_bar = self._clamp(4.5 + 0.4 * math.sin(self._phase["temp"]) + self._noise(0.1), 3.5, 5.5)

        # Electrical
        self._voltage_v = self._clamp(225 + 5 * math.sin(self._phase["volt"]) + self._noise(1), 215, 235)
        # Load varies 5-10 kW
        load_factor = 0.65 + 0.2 * math.sin(self._phase["load"]) + self._noise(0.03)
        self._power_kw = self._clamp(10 * load_factor, 4.5, 10.5)
        pf = 0.85
        self._current_a = (self._power_kw * 1000) / (self._voltage_v * pf)

        # Accumulators
        self._co2_kg += (0.55 * self._power_kw / 1000) * dt  # ~0.55 kg/kWh
        self._fuel_m3 += (2.1 / 3600) * dt   # ~2.1 m³/hr
        self._run_energy_kwh += self._power_kw * dt / 3600

        # Uptime
        if self._run_start:
            self._uptime_hours = (time.time() - self._run_start) / 3600

        # Watchdog
        if self._rpm > ALERT_THRESHOLDS["rpm_high"]:
            self._fault_reason = f"Overspeed: {self._rpm:.0f} RPM"
            self._go_fault()
        elif self._temp_c > ALERT_THRESHOLDS["temp_critical"]:
            self._fault_reason = f"Overtemperature: {self._temp_c:.1f}°C"
            self._go_fault()
        elif self._gas_leak:
            self._fault_reason = "Gas leak detected"
            self._go_fault()

        # Random 2% fault chance (for demo)
        if random.random() < 0.002:
            self._fault_reason = random.choice([
                "Loss of engine RPM signal",
                "Voltage regulator fault",
                "Lubrication pressure low",
            ])
            self._go_fault()

    def _tick_stopping(self, dt: float):
        # RPM coasts down
        self._rpm = self._clamp(self._rpm - 55 + self._noise(8), 0, 1520)
        self._temp_c = max(30.0, self._temp_c - 0.15)
        self._voltage_v = max(0, self._voltage_v - 8)
        self._current_a = max(0, self._current_a - 1.5)
        self._power_kw = max(0, self._power_kw - 0.35)
        self._stop_ticks -= 1
        if self._stop_ticks <= 0 or self._rpm < 10:
            self._rpm = 0.0
            self._voltage_v = 0.0
            self._current_a = 0.0
            self._power_kw = 0.0
            self._state = "STOPPED"

    def _tick_fault(self, dt: float):
        self._rpm = self._clamp(self._rpm - 120 + self._noise(10), 0, 1600)
        self._voltage_v = max(0, self._voltage_v - 20)
        self._current_a = max(0, self._current_a - 3)
        self._power_kw = max(0, self._power_kw - 0.8)
        self._temp_c = max(30.0, self._temp_c - 0.05)

    # ── public tick ───────────────────────────────────────────────────────────
    def tick(self) -> dict:
        now = time.time()
        dt = now - self._last_tick
        self._last_tick = now

        with self._lock:
            state = self._state
            if state == "STOPPED":
                self._tick_stopped(dt)
            elif state == "STARTING":
                self._tick_starting(dt)
            elif state == "RUNNING":
                self._tick_running(dt)
            elif state == "STOPPING":
                self._tick_stopping(dt)
            elif state == "FAULT":
                self._tick_fault(dt)

            freq_hz = round(self._rpm / 30, 2)   # 1500 RPM → 50 Hz
            eff = 35 + 3 * (self._power_kw / 10) if self._power_kw > 0 else 0

            # Build alert string
            alert = self._fault_reason
            if not alert and state == "RUNNING":
                if self._temp_c > ALERT_THRESHOLDS["temp_warning"]:
                    alert = f"High temperature warning: {self._temp_c:.1f}°C"
                elif self._pressure_bar < ALERT_THRESHOLDS["pressure_low"] and self._pressure_bar > 0:
                    alert = f"Gas pressure low: {self._pressure_bar:.2f} bar"

            stops_remaining = self._stop_ticks if state == "STOPPING" else None

            return {
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "state": self._state,
                "rpm": round(self._rpm, 0),
                "temp_c": round(self._temp_c, 1),
                "pressure_bar": round(self._pressure_bar, 2),
                "voltage_v": round(self._voltage_v, 1),
                "current_a": round(self._current_a, 1),
                "frequency_hz": freq_hz,
                "power_kw": round(self._power_kw, 2),
                "efficiency_pct": round(eff, 1),
                "gas_leak": self._gas_leak,
                "estop_active": self._estop_active,
                "starter_relay": self._starter_relay,
                "gas_solenoid": self._gas_solenoid,
                "alarm_buzzer": self._alarm_buzzer,
                "uptime_hours": round(self._uptime_hours, 3),
                "co2_saved_tonnes": round(self._co2_kg / 1000, 4),
                "fuel_m3_used": round(self._fuel_m3, 3),
                "start_count": self._start_count,
                "stop_ticks_remaining": stops_remaining,
                "alert": alert,
                "fault_reason": self._fault_reason,
                "simulation_mode": True,
            }

    def get_state(self) -> str:
        return self._state

    def get_run_energy(self) -> float:
        return self._run_energy_kwh
