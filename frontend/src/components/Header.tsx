import { useEffect, useState } from 'react'
import { colors } from '../styles/theme'

interface HeaderProps {
  connected: boolean
}

function pad(n: number) {
  return String(n).padStart(2, '0')
}

export default function Header({ connected }: HeaderProps) {
  const [time, setTime] = useState(() => new Date())

  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const hh = pad(time.getHours())
  const mm = pad(time.getMinutes())
  const ss = pad(time.getSeconds())

  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 20px',
        background: colors.surface,
        borderBottom: `2px solid ${colors.primary}`,
        flexShrink: 0,
      }}
    >
      {/* Logo + tagline */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
        <span
          style={{
            fontSize: 28,
            fontWeight: 800,
            color: colors.primary,
            letterSpacing: 2,
            textTransform: 'uppercase',
          }}
        >
          FLAMELESS
        </span>
        <span style={{ fontSize: 13, color: colors.textMuted, letterSpacing: 1 }}>
          Crisis Solution · Prototype Impact Monitor
        </span>
      </div>

      {/* Right: connection badge + clock */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 12,
            color: connected ? colors.success : colors.danger,
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: connected ? colors.success : colors.danger,
              display: 'inline-block',
            }}
          />
          {connected ? 'LIVE' : 'OFFLINE'}
        </span>

        <span
          style={{
            fontFamily: 'monospace',
            fontSize: 22,
            fontWeight: 600,
            color: colors.text,
            letterSpacing: 2,
          }}
        >
          {hh}:{mm}:{ss}
        </span>
      </div>
    </header>
  )
}
