import { useState } from 'react'
import { api } from '../services/api'
import type { ControlResponse } from '../types/control'

export function useGeneratorControl() {
  const [loading, setLoading] = useState(false)
  const [lastResult, setLastResult] = useState<ControlResponse | null>(null)

  async function _call(fn: () => Promise<ControlResponse>) {
    setLoading(true)
    try {
      const r = await fn()
      setLastResult(r)
      return r
    } catch (e) {
      const r = { success: false, message: 'Network error' }
      setLastResult(r)
      return r
    } finally {
      setLoading(false)
    }
  }

  const start = () => _call(api.control.start)

  const stop = () => _call(api.control.stop)

  const estop = () => {
    if (!window.confirm('EMERGENCY STOP — generator will shut down immediately.\n\nContinue?')) {
      return Promise.resolve({ success: false, message: 'Cancelled' })
    }
    return _call(api.control.estop)
  }

  const reset = () => _call(api.control.reset)

  const toggleRelay = (name: string, state: boolean) =>
    _call(() => api.control.relay(name, state))

  return { start, stop, estop, reset, toggleRelay, loading, lastResult }
}
