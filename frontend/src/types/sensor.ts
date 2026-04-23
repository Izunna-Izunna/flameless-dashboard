export type GeneratorState = 'STOPPED' | 'STARTING' | 'RUNNING' | 'STOPPING' | 'FAULT'

export interface SensorReading {
  timestamp: string
  state: GeneratorState
  rpm: number
  temp_c: number
  pressure_bar: number
  voltage_v: number
  current_a: number
  frequency_hz: number
  power_kw: number
  efficiency_pct: number
  gas_leak: boolean
  estop_active: boolean
  starter_relay: boolean
  gas_solenoid: boolean
  alarm_buzzer: boolean
  uptime_hours: number
  co2_saved_tonnes: number
  fuel_m3_used: number
  start_count: number
  stop_ticks_remaining: number | null
  alert: string | null
  fault_reason: string | null
  simulation_mode: boolean
}
