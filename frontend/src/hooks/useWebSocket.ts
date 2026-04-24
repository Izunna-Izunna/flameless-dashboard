import { useEffect, useRef, useState } from 'react'
import type { SensorReading } from '../types/sensor'

/**
 * Build the WebSocket URL based on environment:
 *  - Production (VITE_API_URL set): wss://flameless-api.xxx.workers.dev/ws/sensors
 *    Token passed as query param because browsers can't set WS headers.
 *  - Development (no VITE_API_URL): ws://localhost:5000/ws/sensors via same host
 */
function buildWsUrl(): string {
  const apiUrl   = import.meta.env.VITE_API_URL   as string | undefined
  const apiToken = import.meta.env.VITE_API_TOKEN as string | undefined

  if (apiUrl) {
    const wsProtocol = apiUrl.startsWith('https') ? 'wss' : 'ws'
    const base       = apiUrl.replace(/^https?:\/\//, '')
    const token      = apiToken ? `?token=${encodeURIComponent(apiToken)}` : ''
    return `${wsProtocol}://${base}/ws/sensors${token}`
  }

  // Dev: derive from current page (Vite dev server at :3000, Flask at :5000)
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
  return `${proto}://${window.location.hostname}:5000/ws/sensors`
}

const WS_URL          = buildWsUrl()
const HISTORY_URL     = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api/sensors/history`
  : '/api/sensors/history'
const RECONNECT_DELAY_MS = 3000
const MAX_HISTORY        = 300

export function useWebSocket() {
  const [current, setCurrent]   = useState<SensorReading | null>(null)
  const [history, setHistory]   = useState<SensorReading[]>([])
  const [connected, setConnected] = useState(false)
  const wsRef    = useRef<WebSocket | null>(null)
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Fetch history snapshot on mount
  useEffect(() => {
    const headers: HeadersInit = {}
    const token = import.meta.env.VITE_API_TOKEN as string | undefined
    if (token) (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`

    fetch(HISTORY_URL, { headers })
      .then(r => r.json())
      .then((data: SensorReading[]) => setHistory(data.slice(-MAX_HISTORY)))
      .catch(() => {})
  }, [])

  // WebSocket live stream
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
