import { stateColor } from '../../styles/theme'
import type { GeneratorState } from '../../types/sensor'

interface Props { state: GeneratorState; size?: 'sm' | 'md' | 'lg' }

export default function StatusIndicator({ state, size = 'md' }: Props) {
  const c = stateColor(state)
  const fs = size === 'sm' ? 11 : size === 'lg' ? 16 : 13
  const pad = size === 'sm' ? '2px 8px' : size === 'lg' ? '5px 16px' : '3px 12px'
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      background: `${c}22`, border: `1px solid ${c}`, borderRadius: 20,
      padding: pad, fontSize: fs, fontWeight: 700, color: c, letterSpacing: 1,
    }}>
      <span style={{
        width: size === 'sm' ? 6 : 8, height: size === 'sm' ? 6 : 8,
        borderRadius: '50%', background: c, display: 'inline-block',
        animation: state === 'RUNNING' ? 'pulse 2s infinite' : 'none',
      }} />
      {state}
    </span>
  )
}
