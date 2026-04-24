/**
 * FLAMELESS API Service
 * - In development: uses relative /api paths (Vite proxies to localhost:5000)
 * - In production: uses VITE_API_URL (Cloudflare Worker) with Bearer auth
 */
const _API_URL   = import.meta.env.VITE_API_URL   as string | undefined
const _API_TOKEN = import.meta.env.VITE_API_TOKEN as string | undefined

// Base prefix — absolute in production, relative in dev
const BASE = _API_URL ? `${_API_URL}/api` : '/api'

function getHeaders(hasBody = false): Record<string, string> {
  const h: Record<string, string> = {}
  if (hasBody)    h['Content-Type']  = 'application/json'
  if (_API_TOKEN) h['Authorization'] = `Bearer ${_API_TOKEN}`
  return h
}

async function get(url: string) {
  const r = await fetch(url, { headers: getHeaders() })
  return r.json()
}

async function post(url: string, body?: object) {
  const r = await fetch(url, {
    method:  'POST',
    headers: getHeaders(!!body),
    body:    body ? JSON.stringify(body) : undefined,
  })
  return r.json()
}

export const api = {
  control: {
    start:  ()                             => post(`${BASE}/control/start`),
    stop:   ()                             => post(`${BASE}/control/stop`),
    estop:  ()                             => post(`${BASE}/control/estop`),
    reset:  ()                             => post(`${BASE}/control/reset`),
    status: ()                             => get(`${BASE}/control/status`),
    relay:  (name: string, state: boolean) => post(`${BASE}/control/relay/${name}`, { state }),
    choke:  (pct: number)                  => post(`${BASE}/control/choke`, { pct }),
    gpioRaw: ()                            => get(`${BASE}/control/gpio-raw`),
  },
  alerts: {
    active:         ()            => get(`${BASE}/alerts/active`),
    history:        (n = 50)      => get(`${BASE}/alerts/history?limit=${n}`),
    acknowledge:    (id: number)  => post(`${BASE}/alerts/acknowledge`, { id }),
    acknowledgeAll: ()            => post(`${BASE}/alerts/acknowledge-all`),
  },
  diagnostics: {
    health: () => get(`${BASE}/diagnostics/health`),
  },
  stats: {
    runtime:     () => get(`${BASE}/stats/runtime`),
    energy:      () => get(`${BASE}/stats/energy`),
    efficiency:  () => get(`${BASE}/stats/efficiency`),
    maintenance: () => get(`${BASE}/stats/maintenance`),
  },
  sensors: {
    history: () => get(`${BASE}/sensors/history`),
  },
  export: {
    sensorsCsv: () => { window.open(`${BASE}/export/sensors/csv`) },
    faultsCsv:  () => { window.open(`${BASE}/export/faults/csv`) },
  },
}
