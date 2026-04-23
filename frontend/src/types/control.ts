export interface ControlResponse {
  success: boolean
  message: string
  state?: string
}

export interface PreCheck {
  name: string
  passed: boolean
  detail: string
}

export interface ControlStatus {
  state: string
  pre_checks: PreCheck[]
  all_checks_pass: boolean
  stop_ticks_remaining: number | null
}
