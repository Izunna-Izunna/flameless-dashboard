/**
 * Footer status strip: system status, uptime, CO₂ saved, alert message.
 */
import type { SensorReading } from '../types/sensor'
import { colors } from '../styles/theme'

interface StatusBarProps {
  data: SensorReading
}

function statusColor(s: string) {
  if (s === 'RUNNING') return colors.success
  if (s === 'WARNING') return colors.warning
  return colors.danger
}

function formatUptime(hours: number) {
  const h = Math.floor(hours)
  const m = Math.floor((hours - h) * 60)
  return `${h}h ${String(m).padStart(2, '0')}m`
}

export default function StatusBar({ data }: StatusBarProps) {
  const sc = statusColor(data.state)

  return (
    <footer
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: '6px 16px',
        background: colors.surface,
        borderTop: `1px solid ${colors.border}`,
        flexShrink: 0,
        flexWrap: 'wrap',
      }}
    >
      {/* Status pill */}
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          background: `${sc}22`,
          border: `1px solid ${sc}`,
          borderRadius: 20,
          padding: '3px 12px',
          fontSize: 13,
          fontWeight: 700,
          color: sc,
          letterSpacing: 1,
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: sc,
            display: 'inline-block',
            animation: data.state === 'RUNNING' ? 'pulse 2s infinite' : 'none',
          }}
        />
        {data.state}
      </span>

      {/* Uptime */}
      <span style={{ color: colors.textMuted, fontSize: 13 }}>
        Uptime:{' '}
        <strong style={{ color: colors.text }}>{formatUptime(data.uptime_hours)}</strong>
      </span>

      {/* CO₂ saved */}
      <span style={{ color: colors.textMuted, fontSize: 13 }}>
        CO₂ Saved:{' '}
        <strong style={{ color: colors.success }}>
          {data.co2_saved_tonnes < 1
            ? `${(data.co2_saved_tonnes * 1000).toFixed(1)} kg`
            : `${data.co2_saved_tonnes.toFixed(3)} t`}
        </strong>
      </span>

      {/* Separator + alert */}
      <span style={{ marginLeft: 'auto', fontSize: 12, color: colors.warning }}>
        {data.alert ? `⚠ ${data.alert}` : ''}
      </span>
    </footer>
  )
}
