export interface RuntimeStats {
  total_runtime_hours: number
  start_count: number
  avg_runtime_hours: number
  longest_run_hours: number
  availability_pct: number
  total_energy_kwh: number
}

export interface EnergyData {
  date: string
  energy_kwh: number
}

export interface EfficiencyStats {
  natural_gas_m3: number
  avg_consumption_m3_hr: number
  efficiency_pct: number
  cost_per_kwh_ngn: number
  total_energy_kwh: number
}

export interface MaintenanceItem {
  item: string
  hours_remaining: number
  date_due: string
}

export interface PiHealth {
  cpu_pct: number
  mem_pct: number
  disk_pct: number
  temp_c: number
  uptime_str: string
}
