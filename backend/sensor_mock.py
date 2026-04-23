"""
FLAMELESS Generator Monitoring - Mock Sensor Data Generator
Generates realistic, correlated sensor readings with noise and occasional anomalies.
"""

import math
import random
import time
import threading
from datetime import datetime, timezone


class SensorGenerator:
    """
    Produces realistic sensor data for a flare gas-to-electricity generator.
    All parameters are correlated - a drop in flow rate reduces power, which
    lowers temperature, which affects efficiency, etc.
    """

    def __init__(self):
        self._lock = threading.Lock()
        self._start_time = time.time()

        # Baseline / target operating points
        self._targets = {
            "pressure_psi": 22.5,
            "flow_mmscfd": 2.8,
            "temp_c": 72.0,
            "power_kw": 250.0,
            "voltage_v": 415.0,
            "efficiency_pct": 37.5,
        }

        # Slow-drifting internal state (simulates real process dynamics)
        self._state = {
            "pressure_psi": 22.5,
            "flow_mmscfd": 2.8,
            "temp_c": 72.0,
            "power_kw": 250.0,
            "voltage_v": 415.0,
            "efficiency_pct": 37.5,
            "alert": None,
            "status": "RUNNING",
        }

        # Slow drift angles for smooth sinusoidal variation
        self._phase = {k: random.uniform(0, 2 * math.pi) for k in self._state if k not in ("alert", "status")}
        self._co2_kg = 0.0
        self._last_tick = time.time()

        # Alert pool
        self._alert_pool = [
            "High exhaust temperature detected",
            "Gas flow rate below optimal",
            "Voltage fluctuation on Phase B",
            "Fuel-to-air ratio adjustment required",
            "Scheduled maintenance in 48 hours",
            "Pressure sensor calibration recommended",
        ]

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _drift(self, key: str, speed: float = 0.005) -> None:
        """Advance the slow sinusoidal drift for one parameter."""
        self._phase[key] += speed + random.uniform(-0.001, 0.001)

    def _sine_noise(self, key: str, amplitude: float, period_multiplier: float = 1.0) -> float:
        phase = self._phase[key] * period_multiplier
        return amplitude * math.sin(phase) + random.gauss(0, amplitude * 0.15)

    # ------------------------------------------------------------------
    # Public interface
    # ------------------------------------------------------------------

    def tick(self) -> dict:
        """Advance simulation by one step and return the current reading."""
        now = time.time()
        dt = now - self._last_tick
        self._last_tick = now

        with self._lock:
            # Advance drift phases
            for key in self._phase:
                self._drift(key)

            # --- Gas capture pressure (PSI) ---
            pressure = self._targets["pressure_psi"] + self._sine_noise("pressure_psi", 3.5)
            pressure = max(15.0, min(30.0, pressure))

            # --- Flow rate (MMSCFD) – loosely tracks pressure ---
            flow = self._targets["flow_mmscfd"] + self._sine_noise("flow_mmscfd", 0.6) + (pressure - 22.5) * 0.04
            flow = max(0.5, min(5.0, flow))

            # --- Power output (kW) – driven by flow ---
            power = self._targets["power_kw"] + (flow - 2.8) * 18 + self._sine_noise("power_kw", 8)
            power = max(200.0, min(280.0, power))

            # --- Generator temperature (°C) – rises with power ---
            temp = self._targets["temp_c"] + (power - 250.0) * 0.12 + self._sine_noise("temp_c", 2.5)
            temp = max(60.0, min(85.0, temp))

            # --- Voltage (V 3-phase) – slight variation around 415V ---
            voltage = self._targets["voltage_v"] + self._sine_noise("voltage_v", 6)
            voltage = max(400.0, min(430.0, voltage))

            # --- Current (A) – I = P / (√3 × V) ---
            current = (power * 1000) / (math.sqrt(3) * voltage)

            # --- Efficiency (%) – inversely correlated with temperature ---
            efficiency = self._targets["efficiency_pct"] - (temp - 72.0) * 0.05 + self._sine_noise("efficiency_pct", 0.8)
            efficiency = max(35.0, min(40.0, efficiency))

            # --- CO₂ saved (14,000 t/year ≈ 1.597 kg/min) ---
            self._co2_kg += (14_000_000 / (365.25 * 24 * 3600)) * dt  # kg accumulated
            co2_tonnes = self._co2_kg / 1000

            # --- Uptime ---
            uptime_hours = (now - self._start_time) / 3600

            # --- Alert logic (10 % chance per tick, clears after 3 ticks) ---
            alert = None
            if random.random() < 0.10:
                alert = random.choice(self._alert_pool)

            # --- Overall status ---
            status = "RUNNING"
            if temp > 82:
                status = "WARNING"
            if temp > 84 or pressure > 29:
                status = "ALERT"

            reading = {
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "pressure_psi": round(pressure, 2),
                "flow_mmscfd": round(flow, 3),
                "temp_c": round(temp, 1),
                "power_kw": round(power, 1),
                "voltage_v": round(voltage, 1),
                "current_a": round(current, 1),
                "efficiency_pct": round(efficiency, 2),
                "uptime_hours": round(uptime_hours, 3),
                "co2_saved_tonnes": round(co2_tonnes, 4),
                "status": status,
                "alert": alert,
            }

            return reading
