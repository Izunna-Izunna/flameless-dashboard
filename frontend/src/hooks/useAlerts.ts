import { useCallback, useEffect, useState } from 'react'
import { api } from '../services/api'
import type { Alert } from '../types/alert'

export function useAlerts() {
  const [activeAlerts, setActiveAlerts] = useState<Alert[]>([])
  const [faultHistory, setFaultHistory] = useState<Alert[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const [active, history] = await Promise.all([
        api.alerts.active(),
        api.alerts.history(20),
      ])
      setActiveAlerts(active)
      setFaultHistory(history)
    } catch {
      // silently ignore – will retry
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, 5000)
    return () => clearInterval(id)
  }, [refresh])

  const acknowledge = async (id: number) => {
    await api.alerts.acknowledge(id)
    refresh()
  }

  return { activeAlerts, faultHistory, acknowledge, loading, refresh }
}
