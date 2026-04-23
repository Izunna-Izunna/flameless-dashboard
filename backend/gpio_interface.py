"""
FLAMELESS Generator – GPIO / I2C Hardware Interface
====================================================
Auto-detects real hardware on boot:
  • ADS1115 (I2C)  → pressure (A0), NTC temp (A1), ACS712 current (A2), voltage (A3)
  • DS18B20 (1-Wire GPIO4) → coolant temperature (preferred over NTC)
  • RPi.GPIO        → relay outputs (GPIO17/27/22/5), choke PWM (GPIO18)
                      digital inputs: MQ-4 gas leak (GPIO23), E-Stop NC (GPIO24)
                      Hall-effect RPM (GPIO25, interrupt-driven)

If any library is missing or hardware initialisation fails the module falls
back transparently to simulation (sensor_mock_v2.EnhancedSensorGenerator).
The public class name stays EnhancedSensorGenerator so app.py only needs its
import line updated:
    from gpio_interface import EnhancedSensorGenerator
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
PIN_ALARM        = 5    # relay output – alarm buzzer

PIN_SERVO_CHOKE  = 18   # PWM – choke servo (50 Hz)

PIN_MQ4          = 23   # digital input – MQ-4 gas leak (HIGH = leak)
PIN_ESTOP        = 24   # digital input – E-Stop NC  (HIGH = clear, LOW = pressed)
PIN_RPM          = 25   # digital input – Hall-effect RPM sensor

# ── Sensor calibration constants ─────────────────────────────────────────────
# ACS712-30A: sensitivity 66 mV/A, midpoint 2.5 V at 0 A
ACS712_SENSITIVITY = 0.066
ACS712_VREF        = 2.5

# NTC 10K thermistor – Steinhart–Hart β-parameter model
NTC_R_PULLUP = 10_000.0   # pull-up resistor value (Ω)
NTC_R0       = 10_000.0   # resistance at 25 °C
NTC_T0       = 298.15     # 25 °C in Kelvin
NTC_BETA     = 3950.0     # β coefficient for generic 10K NTC

# ADC supply voltage (Raspberry Pi 3.3 V logic)
ADC_VCC = 3.3

# Pressure sensor: 4-20 mA type with 100 Ω shunt → 0.40–2.00 V for 0–10 bar
PRESSURE_V_MIN   = 0.40
PRESSURE_V_MAX   = 2.00
PRESSURE_BAR_MAX = 10.0

# AC voltage sense: step-down transformer + rectifier + divider
# Adjust VOLTAGE_SCALE so that: ADC_voltage × VOLTAGE_SCALE ≈ true AC RMS volts
VOLTAGE_SCALE = 80.0

# ── Hardware detection ────────────────────────────────────────────────────────
HARDWARE_AVAILABLE = False
_GPIO   = None
_pwm_choke = None

_chan_pressure = None
_chan_ntc      = None
_chan_current  = None
_chan_voltage  = None
_ds18b20       = None

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
    _chan_pressure = AnalogIn(_ads, 0)
    _chan_ntc      = AnalogIn(_ads, 1)
    _chan_current  = AnalogIn(_ads, 2)
    _chan_voltage  = AnalogIn(_ads, 3)
    log.info("ADS1115 initialised on I2C (A0=pressure A1=NTC A2=current A3=voltage)")

    try:
        from w1thermsensor import W1ThermSensor
        _ds18b20 = W1ThermSensor()
        log.info("DS18B20 1-Wire sensor found")
    except Exception as _e:
        log.warning("DS18B20 not found (%s) — will use NTC thermistor fallback", _e)

    # ── Output pins ──────────────────────────────────────────────────────────
    for _pin in (PIN_GAS_SOLENOID, PIN_STARTER, PIN_ENGINE_STOP, PIN_ALARM):
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
    """Return engine temperature in °C.  DS18B20 preferred; NTC as fallback."""
    if _ds18b20 is not None:
        try:
            return round(_ds18b20.get_temperature(), 1)
        except Exception as e:
            log.debug("DS18B20 read error: %s", e)

    if _chan_ntc is not None:
        try:
            v = _chan_ntc.voltage
            if 0.01 < v < ADC_VCC - 0.01:
                # Voltage divider: Vcc – R_pullup – NTC – GND
                r_ntc = NTC_R_PULLUP * v / (ADC_VCC - v)
                t_k   = 1.0 / (1.0 / NTC_T0 + math.log(r_ntc / NTC_R0) / NTC_BETA)
                return round(t_k - 273.15, 1)
        except Exception as e:
            log.debug("NTC read error: %s", e)

    return 25.0  # safe default


def _read_pressure() -> float:
    """Return gas pressure in bar from 4–20 mA sensor on ADS1115 A0."""
    if _chan_pressure is None:
        return 0.0
    try:
        v   = _chan_pressure.voltage
        bar = (v - PRESSURE_V_MIN) / (PRESSURE_V_MAX - PRESSURE_V_MIN) * PRESSURE_BAR_MAX
        return round(max(0.0, min(PRESSURE_BAR_MAX, bar)), 2)
    except Exception as e:
        log.debug("Pressure read error: %s", e)
        return 0.0


def _read_current() -> float:
    """Return AC current in amperes from ACS712-30A on ADS1115 A2."""
    if _chan_current is None:
        return 0.0
    try:
        v = _chan_current.voltage
        return round(abs(v - ACS712_VREF) / ACS712_SENSITIVITY, 1)
    except Exception as e:
        log.debug("Current read error: %s", e)
        return 0.0


def _read_voltage() -> float:
    """Return AC RMS voltage from step-down sense circuit on ADS1115 A3."""
    if _chan_voltage is None:
        return 0.0
    try:
        v = _chan_voltage.voltage
        return round(v * VOLTAGE_SCALE, 1)
    except Exception as e:
        log.debug("Voltage read error: %s", e)
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
            _set_relay(PIN_ALARM,        self._alarm_buzzer)

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

            # ── analogue sensors ─────────────────────────────────────────────
            if state in ("RUNNING", "STARTING", "STOPPING"):
                rpm = _read_rpm()
                # Only override mock RPM when we're getting real pulses or running
                if rpm > 10 or state == "RUNNING":
                    data["rpm"] = round(rpm, 0)

                temp = _read_temperature()
                data["temp_c"] = temp

                if state == "RUNNING":
                    data["pressure_bar"] = _read_pressure()
                    current = _read_current()
                    voltage = _read_voltage()
                    data["current_a"] = current
                    data["voltage_v"] = voltage

                    if voltage > 10.0:
                        pf = 0.85
                        data["power_kw"]      = round(current * voltage * pf / 1000.0, 2)
                        data["frequency_hz"]  = round(data["rpm"] / 30.0, 2)
                        data["efficiency_pct"] = round(
                            35 + 3 * (data["power_kw"] / 10.0), 1
                        )

            # Sync relay GPIO after every tick (catches internal SM transitions)
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
                self._sync_relays()
            return result

        def estop(self) -> dict:
            result = super().estop()
            if not _force_simulation:
                _set_relay(PIN_STARTER,      False)
                _set_relay(PIN_GAS_SOLENOID, False)
                _set_relay(PIN_ENGINE_STOP,  True)
                _set_relay(PIN_ALARM,        True)
            return result

        def reset_fault(self) -> dict:
            result = super().reset_fault()
            if result.get("success") and not _force_simulation:
                _set_relay(PIN_ENGINE_STOP, False)
                _set_relay(PIN_ALARM,       False)
                _set_choke(100.0)
                self._sync_relays()
            return result

        def toggle_relay(self, relay: str, state: bool) -> dict:
            result = super().toggle_relay(relay, state)
            if result.get("success"):
                pin_map = {
                    "starter": PIN_STARTER,
                    "gas":     PIN_GAS_SOLENOID,
                    "alarm":   PIN_ALARM,
                }
                pin = pin_map.get(relay)
                if pin is not None:
                    _set_relay(pin, state)
            return result
