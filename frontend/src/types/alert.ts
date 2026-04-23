export interface Alert {
  id: number
  timestamp: string
  fault_type: string
  sensor: string | null
  value: number | null
  threshold: number | null
  state: string
  acknowledged: number
}
