import { useEffect, useState } from 'react'
import { colors, stateColor } from '../../styles/theme'
import type { GeneratorState } from '../../types/sensor'

interface Props { state: GeneratorState; connected: boolean; simulationMode?: boolean }

function pad(n: number) { return String(n).padStart(2, '0') }

export default function Header({ state, connected, simulationMode }: Props) {
  const [time, setTime] = useState(() => new Date())
  useEffect(() => { const id = setInterval(() => setTime(new Date()), 1000); return () => clearInterval(id) }, [])
  const sc = stateColor(state)
  return (
    <header style={{ flexShrink: 0, background: colors.surface, borderBottom: `2px solid ${colors.primary}` }}>
      {simulationMode && (
        <div style={{
          background: '#7c3a00', color: '#ffb347', fontSize: 11, fontWeight: 700,
          textAlign: 'center', padding: '2px 0', letterSpacing: 1,
        }}>
          ⚠ SIMULATION MODE — data is not real · go to Control to switch to real hardware
        </div>
      )}
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 16px', height: 44,
    }}>
      <span style={{ fontSize: 22, fontWeight: 800, color: colors.primary, letterSpacing: 2 }}>
        FLAMELESS
      </span>

      {/* State badge */}
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        background: `${sc}22`, border: `1px solid ${sc}`, borderRadius: 16,
        padding: '2px 10px', fontSize: 11, fontWeight: 700, color: sc,
      }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: sc,
          animation: state === 'RUNNING' ? 'pulse 2s infinite' : 'none' }} />
        {state}
      </span>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 11, color: connected ? colors.success : colors.danger }}>
          {connected ? 'LIVE' : 'OFFLINE'}
        </span>
        <span style={{ fontFamily: 'monospace', fontSize: 18, fontWeight: 600, color: colors.text, letterSpacing: 2 }}>
          {pad(time.getHours())}:{pad(time.getMinutes())}:{pad(time.getSeconds())}
        </span>
      </div>
    </div>
    </header>
  )
}
