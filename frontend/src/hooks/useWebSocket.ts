import { useEffect, useRef, useState } from 'react'
import type { SensorReading } from '../types/sensor'

const WS_URL = `ws://${window.location.hostname}:5000/ws/sensors`
const HISTORY_URL = '/api/sensors/history'
const RECONNECT_DELAY_MS = 3000
const MAX_HISTORY = 300

export function useWebSocket() {
  const [current, setCurrent] = useState<SensorReading | null>(null)
  const [history, setHistory] = useState<SensorReading[]>([])
  const [connected, setConnected] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    fetch(HISTORY_URL)
      .then(r => r.json())
      .then((data: SensorReading[]) => setHistory(data.slice(-MAX_HISTORY)))
      .catch(() => {})
  }, [])

  useEffect(() => {
    let active = true

    function connect() {
      if (!active) return
      const ws = new WebSocket(WS_URL)
      wsRef.current = ws

      ws.onopen = () => {
        if (active) setConnected(true)
      }

      ws.onmessage = (ev) => {
        if (!active) return
        try {
          const reading: SensorReading = JSON.parse(ev.data)
          setCurrent(reading)
          setHistory(prev => {
            const next = [...prev, reading]
            return next.length > MAX_HISTORY ? next.slice(next.length - MAX_HISTORY) : next
          })
        } catch {}
      }

      ws.onclose = () => {
        if (!active) return
        setConnected(false)
        retryRef.current = setTimeout(connect, RECONNECT_DELAY_MS)
      }

      ws.onerror = () => {
        ws.close()
      }
    }

    connect()

    return () => {
      active = false
      if (retryRef.current) clearTimeout(retryRef.current)
      wsRef.current?.close()
    }
  }, [])

  return { current, history, connected }
}
