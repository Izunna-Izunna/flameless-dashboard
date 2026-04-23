import { memo } from 'react'
import { colors, gaugeRanges } from '../../styles/theme'
import type { SensorReading } from '../../types/sensor'
import Gauge from '../Gauge'
import PowerChart from '../PowerChart'

interface Props { current: SensorReading | null; history: SensorReading[] }

function QuickStat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ flex: 1, textAlign: 'center', padding: '4px 0' }}>
      <div style={{ fontSize: 10, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: colors.text, fontFamily: 'monospace' }}>{value}</div>
    </div>
  )
}

function formatUptime(h: number) {
  const hh = Math.floor(h); const mm = Math.floor((h - hh) * 60)
  return `${hh}h ${String(mm).padStart(2,'0')}m`
}

export default memo(function HomeScreen({ current, history }: Props) {
  const d = current

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 6 }}>
      {/* 4 gauges */}
      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
        <Gauge label="Power" value={d?.power_kw ?? 0} unit="kW" min={gaugeRanges.power.min} max={gaugeRanges.power.max} warnAt={0.75} dangerAt={0.92} decimals={1} />
        <Gauge label="Temp" value={d?.temp_c ?? 25} unit="°C" min={gaugeRanges.temp.min} max={gaugeRanges.temp.max} warnAt={0.73} dangerAt={0.88} decimals={1} />
        <Gauge label="RPM" value={d?.rpm ?? 0} unit="RPM" min={gaugeRanges.rpm.min} max={gaugeRanges.rpm.max} warnAt={0.82} dangerAt={0.92} decimals={0} />
        <Gauge label="Pressure" value={d?.pressure_bar ?? 0} unit="bar" min={gaugeRanges.pressure.min} max={gaugeRanges.pressure.max} warnAt={0.72} dangerAt={0.88} decimals={2} />
      </div>

      {/* Quick stats */}
      <div style={{ display: 'flex', background: colors.surfaceAlt, border: `1px solid ${colors.border}`, borderRadius: 8, flexShrink: 0 }}>
        <QuickStat label="Voltage" value={d ? `${d.voltage_v.toFixed(0)}V` : '--'} />
        <div style={{ width: 1, background: colors.border }} />
        <QuickStat label="Current" value={d ? `${d.current_a.toFixed(1)}A` : '--'} />
        <div style={{ width: 1, background: colors.border }} />
        <QuickStat label="Frequency" value={d ? `${d.frequency_hz.toFixed(1)}Hz` : '--'} />
        <div style={{ width: 1, background: colors.border }} />
        <QuickStat label="Efficiency" value={d ? `${d.efficiency_pct.toFixed(1)}%` : '--'} />
      </div>

      {/* Chart */}
      <PowerChart history={history} />

      {/* Footer */}
      <div style={{ display: 'flex', gap: 16, padding: '4px 8px', background: colors.surface, borderRadius: 6, flexShrink: 0, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: colors.textMuted }}>
          Runtime: <strong style={{ color: colors.text }}>{d ? formatUptime(d.uptime_hours) : '--'}</strong>
        </span>
        <span style={{ fontSize: 12, color: colors.textMuted }}>
          Starts: <strong style={{ color: colors.text }}>{d?.start_count ?? 0}</strong>
        </span>
        <span style={{ fontSize: 12, color: colors.textMuted }}>
          CO₂ Saved: <strong style={{ color: colors.success }}>{d ? `${(d.co2_saved_tonnes * 1000).toFixed(1)} kg` : '--'}</strong>
        </span>
        <span style={{ fontSize: 12, color: colors.textMuted }}>
          Fuel Used: <strong style={{ color: colors.text }}>{d ? `${d.fuel_m3_used.toFixed(2)} m³` : '--'}</strong>
        </span>
        {d?.alert && <span style={{ marginLeft: 'auto', fontSize: 12, color: colors.warning }}>⚠ {d.alert}</span>}
      </div>
    </div>
  )
})
