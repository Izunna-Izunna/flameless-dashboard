/**
 * Compact secondary-metrics row: Pressure, Voltage, Current, Efficiency.
 */
import type { SensorReading } from '../types/sensor'
import { colors } from '../styles/theme'

interface MetricsBarProps {
  data: SensorReading
}

interface MetricTileProps {
  label: string
  value: string
  sub?: string
}

function MetricTile({ label, value, sub }: MetricTileProps) {
  return (
    <div
      style={{
        flex: 1,
        background: colors.surfaceAlt,
        border: `1px solid ${colors.border}`,
        borderRadius: 8,
        padding: '8px 12px',
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: 10, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1 }}>
        {label}
      </div>
      <div style={{ fontSize: 20, fontWeight: 700, color: colors.text, marginTop: 2 }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 10, color: colors.textMuted }}>{sub}</div>}
    </div>
  )
}

export default function MetricsBar({ data }: MetricsBarProps) {
  return (
    <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
      <MetricTile
        label="Pressure"
        value={`${data.pressure_bar.toFixed(2)} bar`}
        sub="Target: 4.5"
      />
      <MetricTile
        label="Voltage (3φ)"
        value={`${data.voltage_v.toFixed(0)} V`}
        sub="Target: 415"
      />
      <MetricTile
        label="Current"
        value={`${data.current_a.toFixed(0)} A`}
      />
      <MetricTile
        label="Efficiency"
        value={`${data.efficiency_pct.toFixed(1)} %`}
        sub="Target: 37.5%"
      />
    </div>
  )
}
