const BASE = '/api'

async function post(url: string, body?: object) {
  const r = await fetch(url, {
    method: 'POST',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  })
  return r.json()
}

export const api = {
  control: {
    start:  ()                        => post(`${BASE}/control/start`),
    stop:   ()                        => post(`${BASE}/control/stop`),
    estop:  ()                        => post(`${BASE}/control/estop`),
    reset:  ()                        => post(`${BASE}/control/reset`),
    status: ()                        => fetch(`${BASE}/control/status`).then(r => r.json()),
    relay:  (name: string, state: boolean) => post(`${BASE}/control/relay/${name}`, { state }),
  },
  alerts: {
    active:      ()          => fetch(`${BASE}/alerts/active`).then(r => r.json()),
    history:     (n = 50)    => fetch(`${BASE}/alerts/history?limit=${n}`).then(r => r.json()),
    acknowledge: (id: number) => post(`${BASE}/alerts/acknowledge`, { id }),
  },
  diagnostics: {
    health: () => fetch(`${BASE}/diagnostics/health`).then(r => r.json()),
  },
  stats: {
    runtime:     () => fetch(`${BASE}/stats/runtime`).then(r => r.json()),
    energy:      () => fetch(`${BASE}/stats/energy`).then(r => r.json()),
    efficiency:  () => fetch(`${BASE}/stats/efficiency`).then(r => r.json()),
    maintenance: () => fetch(`${BASE}/stats/maintenance`).then(r => r.json()),
  },
  export: {
    sensorsCsv: () => { window.open(`${BASE}/export/sensors/csv`) },
    faultsCsv:  () => { window.open(`${BASE}/export/faults/csv`) },
  },
}
