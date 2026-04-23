import { colors } from '../../styles/theme'
import type { SensorReading } from '../../types/sensor'

interface Props { current: SensorReading | null; history: SensorReading[] }

function ProgressBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100))
  return (
    <div style={{ height: 8, background: colors.border, borderRadius: 4, overflow: 'hidden', flex: 1 }}>
      <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 4, transition: 'width 0.4s ease' }} />
    </div>
  )
}

function BarRow({ label, value, unit, max, color }: { label: string; value: number; unit: string; max: number; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
      <span style={{ fontSize: 12, color: colors.textMuted, width: 72 }}>{label}</span>
      <ProgressBar value={value} max={max} color={color} />
      <span style={{ fontSize: 12, fontWeight: 700, color, width: 72, textAlign: 'right', fontFamily: 'monospace' }}>
        {value.toFixed(1)} {unit}
      </span>
    </div>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: colors.surfaceAlt, border: `1px solid ${colors.border}`, borderRadius: 8, padding: '8px 12px', marginBottom: 8 }}>
      <div style={{ fontSize: 11, color: colors.primary, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700, marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  )
}

function sessionStat(history: SensorReading[], key: keyof SensorReading) {
  const vals = history.map(r => r[key] as number).filter(v => typeof v === 'number' && v > 0)
  if (!vals.length) return { min: 0, max: 0, avg: 0 }
  return { min: Math.min(...vals), max: Math.max(...vals), avg: vals.reduce((a, b) => a + b, 0) / vals.length }
}

export default function SensorsScreen({ current: d, history }: Props) {
  if (!d) return <div style={{ color: colors.textMuted, textAlign: 'center', marginTop: 40 }}>Waiting for sensor data…</div>

  const pwr = sessionStat(history, 'power_kw')
  const tmp = sessionStat(history, 'temp_c')
  const tempColor = d.temp_c > 85 ? colors.danger : d.temp_c > 75 ? colors.warning : colors.success
  const voltColor = d.voltage_v < 210 || d.voltage_v > 240 ? colors.danger : colors.success
  const rpmColor  = d.rpm > 1700 ? colors.danger : d.rpm > 1550 ? colors.warning : colors.success

  return (
    <div className="touch-scroll">

      <Card title="Power Output">
        <div style={{ display: 'flex', gap: 16, marginBottom: 8 }}>
          <div>
            <div style={{ fontSize: 28, fontWeight: 800, color: colors.chart, fontFamily: 'monospace' }}>{d.power_kw.toFixed(2)}</div>
            <div style={{ fontSize: 11, color: colors.textMuted }}>kW current</div>
          </div>
          <div style={{ borderLeft: `1px solid ${colors.border}`, paddingLeft: 12, fontSize: 12, color: colors.textMuted, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2 }}>
            <div>Min: <strong style={{ color: colors.text }}>{pwr.min.toFixed(2)} kW</strong></div>
            <div>Max: <strong style={{ color: colors.text }}>{pwr.max.toFixed(2)} kW</strong></div>
            <div>Avg: <strong style={{ color: colors.text }}>{pwr.avg.toFixed(2)} kW</strong></div>
          </div>
        </div>
        <BarRow label="Power" value={d.power_kw} unit="kW" max={12} color={colors.chart} />
        <BarRow label="Efficiency" value={d.efficiency_pct} unit="%" max={50} color={colors.success} />
      </Card>

      <Card title="Engine Temperature">
        <div style={{ display: 'flex', gap: 16, marginBottom: 8 }}>
          <div>
            <div style={{ fontSize: 28, fontWeight: 800, color: tempColor, fontFamily: 'monospace' }}>{d.temp_c.toFixed(1)}</div>
            <div style={{ fontSize: 11, color: colors.textMuted }}>°C current</div>
          </div>
          <div style={{ borderLeft: `1px solid ${colors.border}`, paddingLeft: 12, fontSize: 12, color: colors.textMuted, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2 }}>
            <div>Min: <strong style={{ color: colors.text }}>{tmp.min.toFixed(1)}°C</strong></div>
            <div>Max: <strong style={{ color: colors.text }}>{tmp.max.toFixed(1)}°C</strong></div>
            <div>Warning: <strong style={{ color: colors.warning }}>85°C</strong> | Critical: <strong style={{ color: colors.danger }}>95°C</strong></div>
          </div>
        </div>
        <BarRow label="Temp" value={d.temp_c} unit="°C" max={100} color={tempColor} />
      </Card>

      <Card title="Engine Speed">
        <div style={{ display: 'flex', gap: 16, marginBottom: 8 }}>
          <div>
            <div style={{ fontSize: 28, fontWeight: 800, color: rpmColor, fontFamily: 'monospace' }}>{d.rpm.toFixed(0)}</div>
            <div style={{ fontSize: 11, color: colors.textMuted }}>RPM current</div>
          </div>
          <div style={{ borderLeft: `1px solid ${colors.border}`, paddingLeft: 12, fontSize: 12, color: colors.textMuted, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2 }}>
            <div>Target: <strong style={{ color: colors.text }}>1500 RPM</strong></div>
            <div>Frequency: <strong style={{ color: colors.text }}>{d.frequency_hz.toFixed(1)} Hz</strong></div>
            <div>Max safe: <strong style={{ color: colors.warning }}>1800 RPM</strong></div>
          </div>
        </div>
        <BarRow label="RPM"       value={d.rpm}          unit=""   max={2000} color={rpmColor} />
        <BarRow label="Frequency" value={d.frequency_hz} unit="Hz" max={60}   color={colors.info} />
      </Card>

      <Card title="Gas System">
        <BarRow label="Pressure" value={d.pressure_bar} unit="bar" max={10} color={d.pressure_bar < 3 ? colors.warning : colors.success} />
        <div style={{ display: 'flex', gap: 20, fontSize: 12, marginTop: 6 }}>
          <span style={{ color: colors.textMuted }}>Solenoid: <strong style={{ color: d.gas_solenoid ? colors.success : colors.textMuted }}>{d.gas_solenoid ? 'OPEN' : 'CLOSED'}</strong></span>
          <span style={{ color: colors.textMuted }}>Leak: <strong style={{ color: d.gas_leak ? colors.danger : colors.success }}>{d.gas_leak ? 'DETECTED' : 'CLEAR'}</strong></span>
          <span style={{ color: colors.textMuted }}>E-Stop: <strong style={{ color: d.estop_active ? colors.danger : colors.success }}>{d.estop_active ? 'ACTIVE' : 'CLEAR'}</strong></span>
        </div>
      </Card>

      <Card title="Electrical Output">
        <BarRow label="Voltage"   value={d.voltage_v}    unit="V"  max={240} color={voltColor} />
        <BarRow label="Current"   value={d.current_a}    unit="A"  max={50}  color={colors.chart} />
        <BarRow label="Frequency" value={d.frequency_hz} unit="Hz" max={60}  color={colors.info} />
        <BarRow label="Power"     value={d.power_kw}     unit="kW" max={12}  color={colors.success} />
      </Card>
    </div>
  )
}
