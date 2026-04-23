import { useCallback, useEffect, useState } from 'react'
import { api } from '../services/api'
import type { RuntimeStats, EnergyData, EfficiencyStats, MaintenanceItem, PiHealth } from '../types/stats'

interface StatsState {
  runtime: RuntimeStats | null
  energyHistory: EnergyData[]
  efficiency: EfficiencyStats | null
  maintenance: MaintenanceItem[]
  piHealth: PiHealth | null
  loading: boolean
}

export function useStats() {
  const [state, setState] = useState<StatsState>({
    runtime: null, energyHistory: [], efficiency: null,
    maintenance: [], piHealth: null, loading: true,
  })

  const refresh = useCallback(async () => {
    try {
      const [runtime, energy, efficiency, maintenance, piHealth] = await Promise.all([
        api.stats.runtime(),
        api.stats.energy(),
        api.stats.efficiency(),
        api.stats.maintenance(),
        api.diagnostics.health(),
      ])
      setState({ runtime, energyHistory: energy, efficiency, maintenance, piHealth, loading: false })
    } catch {
      setState(s => ({ ...s, loading: false }))
    }
  }, [])

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, 30000)
    return () => clearInterval(id)
  }, [refresh])

  return { ...state, refresh }
}
