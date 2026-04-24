"""
FLAMELESS Generator – GPIO / I2C Hardware Interface
====================================================
Auto-detects real hardware on boot:
  • ADS1115 (I2C 0x48)  → A0 = pressure (Toyota 89458-22010, ratiometric 0.5–4.5 V on 5 V)
                           A1 = MQ-4 analog out (0–5 V gas concentration)
                           A2 = ZMPT101B AC voltage sensor
                           A3 = SCT-013 100 A CT clamp (AC current)
  • DS18B20 (1-Wire GPIO4) → coolant temperature (sole temperature sensor)
  • RPi.GPIO        → relay outputs (GPIO17/27/22/5*), choke PWM (GPIO18)
                      digital inputs: MQ-4 DO gas leak (GPIO23), E-Stop NC (GPIO24)
                      Hall-effect RPM (GPIO25, interrupt-driven)
                      *GPIO5 = Spare relay (reserved for future expansion)

If any library is missing or hardware initialisation fails the module falls
back transparently to simulation (sensor_mock_v2.EnhancedSensorGenerator).
The public class name stays EnhancedSensorGenerator so app.py only needs its
import line updated:
    from gpio_interface import EnhancedSensorGenerator

Wiring diagram revision: v2.0 (2026-04-23)
"""

import atexit
import logging
import math
import threading
import time

log = logging.getLogger(__name__)

# ── Pin assignments (BCM numbering) ──────────────────────────────────────────
PIN_GAS_SOLENOID = 17   # relay output – gas valve
PIN_STARTER      = 27   # relay output – starter motor
PIN_ENGINE_STOP  = 22   # relay output – engine stop solenoid
PIN_SPARE        = 5    # relay output – Spare / future expansion (was alarm buzzer, removed in Rev 2.0)

PIN_SERVO_CHOKE  = 18   # PWM – choke servo (50 Hz)

PIN_MQ4          = 23   # digital input – MQ-4 gas leak (HIGH = leak)
PIN_ESTOP        = 24   # digital input – E-Stop NC  (HIGH = clear, LOW = pressed)
PIN_RPM          = 25   # digital input – Hall-effect RPM sensor

# ── Sensor calibration constants ─────────────────────────────────────────────

# ADS1115 reference voltage (module powered from 5 V rail via LLC)
ADC_VCC = 5.0

# A0 – Pressure: Toyota/Lexus 89458-22010 ratiometric sensor
# 3-wire, 5 V supply → output 0.5 V (0 bar) to 4.5 V (10 bar)
PRESSURE_V_MIN   = 0.5
PRESSURE_V_MAX   = 4.5
PRESSURE_BAR_MAX = 10.0

# A1 – MQ-4 gas sensor analog out (0–5 V proportional to gas concentration)
# Used for continuous analog concentration reading (digital DO also on GPIO23)
# Raw voltage is exposed as-is; thresholding done in caller
MQ4_AO_V_MAX = 5.0   # full-scale reference

# A2 – ZMPT101B AC voltage sensor
# Calibration: multiply ADC RMS voltage by this scale factor to get AC RMS volts
# Tune on-site: measure with multimeter and adjust until value matches.
ZMPT101B_SCALE = 200.0

# A3 – SCT-013 100A CT clamp (current transformer)
# Burden resistor on ADC input sets sensitivity:
#   SCT-013-000 (no built-in burden): external 33 Ω → ~0.55 V at 100 A
#   SCT-013-100 (built-in 100 Ω):    1 V at 100 A → 100 A/V
# Adjust SCT013_AMPS_PER_VOLT to match your specific SCT-013 variant.
SCT013_AMPS_PER_VOLT = 100.0  # for SCT-013-100 (built-in burden)

# ── Hardware detection ────────────────────────────────────────────────────────
HARDWARE_AVAILABLE = False
_GPIO   = None
_pwm_choke = None

_chan_pressure = None   # ADS1115 A0 – Toyota pressure transducer (ratiometric 0.5–4.5 V)
_chan_mq4_ao   = None   # ADS1115 A1 – MQ-4 analog concentration output
_chan_voltage  = None   # ADS1115 A2 – ZMPT101B AC voltage
_chan_current  = None   # ADS1115 A3 – SCT-013 100 A CT clamp
_ds18b20       = None   # DS18B20 1-Wire – sole temperature sensor

try:
    import RPi.GPIO as _rpi_gpio
    _GPIO = _rpi_gpio
    _GPIO.setmode(_GPIO.BCM)
    _GPIO.setwarnings(False)
    log.info("RPi.GPIO loaded (BCM mode)")

    import board
    import busio
    import adafruit_ads1x15.ads1115 as ADS
    from adafruit_ads1x15.analog_in import AnalogIn

    _i2c = busio.I2C(board.SCL, board.SDA)
    _ads = ADS.ADS1115(_i2c)
    _chan_pressure = AnalogIn(_ads, 0)   # A0 – pressure (ratiometric 0.5–4.5 V)
    _chan_mq4_ao   = AnalogIn(_ads, 1)   # A1 – MQ-4 analog concentration
    _chan_voltage  = AnalogIn(_ads, 2)   # A2 – ZMPT101B AC voltage
    _chan_current  = AnalogIn(_ads, 3)   # A3 – SCT-013 100 A AC current
    log.info("ADS1115 initialised (A0=pressure A1=MQ4-AO A2=ZMPT101B-voltage A3=SCT013-current)")

    try:
        from w1thermsensor import W1ThermSensor
        _ds18b20 = W1ThermSensor()
        log.info("DS18B20 1-Wire sensor found (sole temperature sensor)")
    except Exception as _e:
        log.warning("DS18B20 not found (%s) — temperature unavailable (no NTC fallback)", _e)

    # ── Output pins ──────────────────────────────────────────────────────────
    for _pin in (PIN_GAS_SOLENOID, PIN_STARTER, PIN_ENGINE_STOP, PIN_SPARE):
        _GPIO.setup(_pin, _GPIO.OUT, initial=_GPIO.LOW)

    # Choke servo on GPIO18 — must setup as OUTPUT before creating PWM
    _GPIO.setup(PIN_SERVO_CHOKE, _GPIO.OUT, initial=_GPIO.LOW)
    _pwm_choke = _GPIO.PWM(PIN_SERVO_CHOKE, 50)
    _pwm_choke.start(7.5)

    # ── Input pins ───────────────────────────────────────────────────────────
    _GPIO.setup(PIN_MQ4,   _GPIO.IN, pull_up_down=_GPIO.PUD_DOWN)
    _GPIO.setup(PIN_ESTOP, _GPIO.IN, pull_up_down=_GPIO.PUD_UP)   # NC → HIGH = clear
    _GPIO.setup(PIN_RPM,   _GPIO.IN, pull_up_down=_GPIO.PUD_UP)

    HARDWARE_AVAILABLE = True
    log.info("FLAMELESS: HARDWARE MODE active (all peripherals initialised)")

except Exception as _hw_exc:
    log.warning("Hardware unavailable (%s) — falling back to SIMULATION MODE", _hw_exc)


# ── RPM interrupt counter ─────────────────────────────────────────────────────
_rpm_count     = 0
_rpm_lock      = threading.Lock()
_rpm_last_time = time.monotonic()

def _rpm_isr(channel):          # noqa: N802
    global _rpm_count
    with _rpm_lock:
        _rpm_count += 1

if HARDWARE_AVAILABLE and _GPIO is not None:
    try:
        _GPIO.remove_event_detect(PIN_RPM)
    except Exception:
        pass
    try:
        _GPIO.add_event_detect(PIN_RPM, _GPIO.RISING, callback=_rpm_isr, bouncetime=5)
        log.info("RPM Hall-effect interrupt registered on GPIO%d", PIN_RPM)
    except Exception as _e:
        log.warning("RPM edge detection unavailable (%s) — will poll GPIO instead", _e)


# ── Raw sensor readers ────────────────────────────────────────────────────────

def _read_rpm() -> float:
    """Return RPM calculated from Hall-effect pulse count since last call."""
    global _rpm_count, _rpm_last_time
    with _rpm_lock:
        count, _rpm_count = _rpm_count, 0
    now = time.monotonic()
    dt  = now - _rpm_last_time
    _rpm_last_time = now
    if dt <= 0:
        return 0.0
    # 1 magnet per revolution → 1 pulse/rev
    return (count / 1) * (60.0 / dt)


def _read_temperature() -> float:
    """Return engine temperature in °C from DS18B20 (sole temperature sensor)."""
    if _ds18b20 is not None:
        try:
            return round(_ds18b20.get_temperature(), 1)
        except Exception as e:
            log.debug("DS18B20 read error: %s", e)

    return 25.0  # safe default — DS18B20 unavailable


def _read_pressure() -> float:
    """Return gas pressure in bar.

    Sensor: Toyota/Lexus 89458-22010 ratiometric transducer on ADS1115 A0.
    Supply: 5 V → output range 0.5 V (0 bar) to 4.5 V (10 bar).
    """
    if _chan_pressure is None:
        return 0.0
    try:
        v   = _chan_pressure.voltage
        bar = (v - PRESSURE_V_MIN) / (PRESSURE_V_MAX - PRESSURE_V_MIN) * PRESSURE_BAR_MAX
        return round(max(0.0, min(PRESSURE_BAR_MAX, bar)), 2)
    except Exception as e:
        log.debug("Pressure read error: %s", e)
        return 0.0


def _read_mq4_analog() -> float:
    """Return MQ-4 analog concentration as a 0–100 % scale value.

    Sensor: MQ-4 AO (analog out) on ADS1115 A1.  0 V ≈ clean air, 5 V ≈ max.
    Returned as percentage of full-scale for dashboard display.
    Digital threshold detection is handled separately via GPIO23 (MQ-4 DO).
    """
    if _chan_mq4_ao is None:
        return 0.0
    try:
        v = _chan_mq4_ao.voltage
        return round(max(0.0, min(100.0, (v / MQ4_AO_V_MAX) * 100.0)), 1)
    except Exception as e:
        log.debug("MQ-4 AO read error: %s", e)
        return 0.0


def _read_voltage() -> float:
    """Return AC RMS voltage from ZMPT101B sensor on ADS1115 A2.

    Scale factor ZMPT101B_SCALE must be calibrated on-site against a multimeter.
    """
    if _chan_voltage is None:
        return 0.0
    try:
        v = _chan_voltage.voltage
        return round(v * ZMPT101B_SCALE, 1)
    except Exception as e:
        log.debug("Voltage read error: %s", e)
        return 0.0


def _read_current() -> float:
    """Return AC RMS current in amperes from SCT-013 100 A CT clamp on ADS1115 A3.

    SCT013_AMPS_PER_VOLT converts the ADC voltage to current.
    Calibrate by adjusting burden resistor or SCT013_AMPS_PER_VOLT constant.
    """
    if _chan_current is None:
        return 0.0
    try:
        v = _chan_current.voltage
        return round(max(0.0, v * SCT013_AMPS_PER_VOLT), 1)
    except Exception as e:
        log.debug("Current read error: %s", e)
        return 0.0


def _read_gas_leak() -> bool:
    """Return True if MQ-4 sensor asserts a gas leak (GPIO23 HIGH)."""
    if _GPIO is None:
        return False
    try:
        return bool(_GPIO.input(PIN_MQ4))
    except Exception:
        return False


def _read_estop_active() -> bool:
    """Return True if E-Stop is pressed (NC contact opened → GPIO24 LOW)."""
    if _GPIO is None:
        return False
    try:
        return not bool(_GPIO.input(PIN_ESTOP))
    except Exception:
        return False


def _set_relay(pin: int, state: bool) -> None:
    """Drive a relay output pin HIGH (energised) or LOW (de-energised)."""
    if _GPIO is None:
        return
    try:
        _GPIO.output(pin, _GPIO.HIGH if state else _GPIO.LOW)
    except Exception as e:
        log.warning("GPIO write error pin %d: %s", pin, e)


def _set_choke(open_pct: float) -> None:
    """Set choke servo position.  0 % = closed, 100 % = fully open."""
    if _pwm_choke is None:
        return
    # Servo: 5 % duty = 0°, 10 % duty = 180° → map 0–100 % → 5–10 %
    duty = 5.0 + (open_pct / 100.0) * 5.0
    _pwm_choke.ChangeDutyCycle(duty)


# ── Cleanup ───────────────────────────────────────────────────────────────────

def _cleanup():
    if not HARDWARE_AVAILABLE:
        return
    try:
        if _pwm_choke:
            _pwm_choke.stop()
        _GPIO.cleanup()
        log.info("GPIO cleanup complete")
    except Exception:
        pass

atexit.register(_cleanup)


# ── Runtime mode switch ───────────────────────────────────────────────────────
# Can be toggled via POST /api/system/mode {"simulation": true/false}
# When True  → pure simulation regardless of hardware presence
# When False → use real GPIO/sensors (only if HARDWARE_AVAILABLE, else stays sim)
_force_simulation: bool = not HARDWARE_AVAILABLE   # default: sim if no HW

def set_simulation_mode(enabled: bool) -> dict:
    global _force_simulation
    if enabled:
        _force_simulation = True
        log.info("Switched to SIMULATION MODE (user request)")
        return {"ok": True, "simulation_mode": True, "hardware_available": HARDWARE_AVAILABLE}
    else:
        if not HARDWARE_AVAILABLE:
            log.warning("Cannot switch to REAL mode — hardware not connected")
            return {"ok": False, "error": "Hardware not connected — ADS1115/GPIO not detected",
                    "simulation_mode": True, "hardware_available": False}
        _force_simulation = False
        log.info("Switched to REAL HARDWARE MODE (user request)")
        return {"ok": True, "simulation_mode": False, "hardware_available": True}

def get_mode() -> dict:
    return {
        "simulation_mode": _force_simulation,
        "hardware_available": HARDWARE_AVAILABLE,
    }

# ── Public sensor class ───────────────────────────────────────────────────────

from sensor_mock_v2 import EnhancedSensorGenerator as _MockGenerator  # noqa: E402

if not HARDWARE_AVAILABLE:
    # ── Simulation-only: no GPIO present ─────────────────────────────────────
    class EnhancedSensorGenerator(_MockGenerator):
        """Thin wrapper that logs it is in simulation mode."""
        def __init__(self):
            super().__init__()
            log.info("EnhancedSensorGenerator: SIMULATION MODE (no hardware detected)")

else:
    # ── Hardware mode: overlay real readings onto the state machine ───────────
    class EnhancedSensorGenerator(_MockGenerator):  # type: ignore[no-redef]
        """
        Hardware-backed generator controller.

        The state machine (STOPPED → STARTING → RUNNING → STOPPING → FAULT)
        is inherited unchanged from sensor_mock_v2.EnhancedSensorGenerator.
        tick() calls super().tick() to advance the state machine, then
        overlays live sensor values read from hardware before returning.

        Relay writes are mirrored to real GPIO pins after every control command
        and after every tick (to catch internal state-machine transitions).
        """

        def __init__(self):
            super().__init__()
            log.info("EnhancedSensorGenerator: HARDWARE MODE")
            # Open choke fully on init (safe starting position)
            _set_choke(100.0)

        # ── helpers ──────────────────────────────────────────────────────────

        def _sync_relays(self) -> None:
            """Push current relay state from Python attributes to GPIO pins."""
            _set_relay(PIN_STARTER,      self._starter_relay)
            _set_relay(PIN_GAS_SOLENOID, self._gas_solenoid)
            # PIN_SPARE (GPIO5) is not driven by the state machine — reserved for future use

        def _hw_fault(self, reason: str) -> None:
            """Trigger a fault from hardware event, inside caller's lock."""
            self._fault_reason = reason
            self._go_fault()
            # _go_fault() sets starter=False, gas=False, alarm=True → sync now
            self._sync_relays()

        # ── tick ─────────────────────────────────────────────────────────────

        def tick(self) -> dict:
            """Advance the state machine then overlay real sensor readings."""
            data  = super().tick()          # runs state machine
            state = data["state"]

            # If user forced simulation mode, skip all hardware I/O
            if _force_simulation:
                data["simulation_mode"] = True
                return data

            data["simulation_mode"] = False

            # ── digital inputs (always) ──────────────────────────────────────
            gas_leak    = _read_gas_leak()
            estop_active = _read_estop_active()
            data["gas_leak"]     = gas_leak
            data["estop_active"] = estop_active

            # ── hardware fault triggers ───────────────────────────────────────
            if estop_active and state not in ("FAULT", "STOPPED"):
                with self._lock:
                    if self._state not in ("FAULT", "STOPPED"):
                        self._hw_fault("E-Stop activated (hardware)")
                data["state"]        = "FAULT"
                data["fault_reason"] = self._fault_reason

            elif gas_leak and state not in ("FAULT", "STOPPED"):
                with self._lock:
                    if self._state not in ("FAULT", "STOPPED"):
                        self._hw_fault("Gas leak detected (MQ-4)")
                data["state"]        = "FAULT"
                data["fault_reason"] = self._fault_reason

            # ── Strip ALL mock-generated numeric values ───────────────────────
            # In hardware mode we never want simulated numbers on the dashboard.
            # Every field below is replaced with a real reading or an explicit 0.
            for _f in ("rpm", "temp_c", "pressure_bar", "current_a", "voltage_v",
                        "power_kw", "frequency_hz", "efficiency_pct"):
                data.pop(_f, None)

            # ── Temperature — always read, all states ────────────────────────
            data["temp_c"] = _read_temperature()

            # ── MQ-4 analog concentration — always read ───────────────────────
            data["mq4_concentration_pct"] = _read_mq4_analog()

            # ── RPM & pressure — only meaningful while engine is active ──────
            if state in ("RUNNING", "STARTING", "STOPPING"):
                data["rpm"]          = round(_read_rpm(), 0)
                data["pressure_bar"] = _read_pressure()
            else:
                data["rpm"]          = 0.0
                data["pressure_bar"] = 0.0

            # ── AC current & voltage — only valid while RUNNING ───────────────
            if state == "RUNNING":
                current = _read_current()
                voltage = _read_voltage()
                data["current_a"] = current
                data["voltage_v"] = voltage
                if voltage > 10.0:
                    pf = 0.85
                    data["power_kw"]       = round(current * voltage * pf / 1000.0, 2)
                    data["frequency_hz"]   = round(data["rpm"] / 30.0, 2)
                    data["efficiency_pct"] = round(35 + 3 * (data["power_kw"] / 10.0), 1)
                else:
                    data["current_a"]      = 0.0
                    data["voltage_v"]      = 0.0
                    data["power_kw"]       = 0.0
                    data["frequency_hz"]   = 0.0
                    data["efficiency_pct"] = 0.0
            else:
                data["current_a"]      = 0.0
                data["voltage_v"]      = 0.0
                data["power_kw"]       = 0.0
                data["frequency_hz"]   = 0.0
                data["efficiency_pct"] = 0.0

            # ── Release engine-stop relay once engine has fully stopped ───────
            if state == "STOPPED":
                _set_relay(PIN_ENGINE_STOP, False)

            # Sync starter + gas solenoid after every tick
            self._sync_relays()

            return data

        # ── control commands ─────────────────────────────────────────────────

        def start_generator(self) -> dict:
            result = super().start_generator()
            if result.get("success") and not _force_simulation:
                _set_choke(80.0)
                self._sync_relays()
            return result

        def stop_generator(self) -> dict:
            result = super().stop_generator()
            if result.get("success") and not _force_simulation:
                _set_relay(PIN_ENGINE_STOP, True)  # energise stop solenoid (GPIO22)
                self._sync_relays()                # also cuts starter + gas solenoid
            return result

        def estop(self) -> dict:
            result = super().estop()
            if not _force_simulation:
                _set_relay(PIN_STARTER,      False)
                _set_relay(PIN_GAS_SOLENOID, False)
                _set_relay(PIN_ENGINE_STOP,  True)
                # PIN_SPARE is not used for alarm — buzzer removed in Rev 2.0
            return result

        def reset_fault(self) -> dict:
            result = super().reset_fault()
            if result.get("success") and not _force_simulation:
                _set_relay(PIN_ENGINE_STOP, False)
                _set_choke(100.0)
                self._sync_relays()
            return result

        def toggle_relay(self, relay: str, state: bool) -> dict:
            result = super().toggle_relay(relay, state)
            if result.get("success"):
                pin_map = {
                    "starter": PIN_STARTER,
                    "gas":     PIN_GAS_SOLENOID,
                    "stop":    PIN_ENGINE_STOP,
                    "spare":   PIN_SPARE,
                }
                pin = pin_map.get(relay)
                if pin is not None:
                    _set_relay(pin, state)
            return result

        def set_choke_pct(self, pct: float) -> dict:
            """Set choke servo position via PWM (GPIO18)."""
            if not _force_simulation:
                _set_choke(pct)
            return {"success": True, "message": f"Choke set to {pct:.0f}%", "pct": pct}
