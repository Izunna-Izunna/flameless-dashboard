import { colors } from '../../styles/theme'
import type { SensorReading } from '../../types/sensor'
import { useAlerts } from '../../hooks/useAlerts'
import { useStats } from '../../hooks/useStats'
import { api } from '../../services/api'

interface Props { current: SensorReading | null }

function formatTS(ts: string) {
  try { return new Date(ts).toLocaleString() } catch { return ts }
}

function Card({ title, titleColor, children }: { title: string; titleColor?: string; children: React.ReactNode }) {
  return (
    <div style={{ background: colors.surfaceAlt, border: `1px solid ${colors.border}`, borderRadius: 8, padding: '8px 12px', marginBottom: 8 }}>
      <div style={{ fontSize: 11, color: titleColor ?? colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700, marginBottom: 6 }}>{title}</div>
      {children}
    </div>
  )
}

export default function AlertsScreen({ current: d }: Props) {
  const { activeAlerts, faultHistory, acknowledge } = useAlerts()
  const { piHealth } = useStats()

  const safetyItems = [
    { label: 'E-Stop',          ok: !d?.estop_active,          detail: d?.estop_active ? 'ENGAGED' : 'Clear' },
    { label: 'Gas Leak',        ok: !d?.gas_leak,              detail: d?.gas_leak ? 'DETECTED' : 'Not detected' },
    { label: 'Overpressure',    ok: (d?.pressure_bar ?? 0) < 8, detail: `${d?.pressure_bar?.toFixed(2) ?? '?'} / 10 bar` },
    { label: 'Overtemperature', ok: (d?.temp_c ?? 0) < 95,     detail: `${d?.temp_c?.toFixed(1) ?? '?'} / 95°C` },
    { label: 'Overspeed',       ok: (d?.rpm ?? 0) < 1800,      detail: `${d?.rpm?.toFixed(0) ?? '?'} / 1800 RPM` },
    { label: 'Starter',         ok: !d?.starter_relay,         detail: d?.starter_relay ? 'Running' : 'Not running' },
  ]

  return (
    <div className="touch-scroll">

      {/* Active alerts */}
      <Card title={`Active Alerts (${activeAlerts.length})`} titleColor={activeAlerts.length ? colors.danger : colors.success}>
        {activeAlerts.length === 0 && (
          <div style={{ fontSize: 13, color: colors.success }}>✓ No active alerts</div>
        )}
        {activeAlerts.map(a => (
          <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: `1px solid ${colors.border}` }}>
            <div>
              <div style={{ fontSize: 13, color: colors.warning, fontWeight: 600 }}>⚠ {a.fault_type}</div>
              <div style={{ fontSize: 10, color: colors.textMuted }}>{formatTS(a.timestamp)} — state: {a.state}</div>
            </div>
            <button onClick={() => acknowledge(a.id)} style={{
              padding: '3px 10px', border: `1px solid ${colors.border}`, borderRadius: 6,
              background: 'transparent', color: colors.textMuted, cursor: 'pointer', fontSize: 11, fontFamily: 'inherit',
            }}>
              Acknowledge
            </button>
          </div>
        ))}
      </Card>

      {/* Safety status */}
      <Card title="Safety Status" titleColor={safetyItems.every(s => s.ok) ? colors.success : colors.danger}>
        {safetyItems.map(s => (
          <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: 13 }}>
            <span style={{ color: s.ok ? colors.success : colors.danger, fontWeight: 600 }}>{s.ok ? '✓' : '✗'} {s.label}</span>
            <span style={{ color: colors.textMuted, fontSize: 12 }}>{s.detail}</span>
          </div>
        ))}
      </Card>

      {/* Fault history */}
      <Card title="Fault History (Last 10)">
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 4 }}>
          <button onClick={() => api.export.faultsCsv()} style={{
            padding: '2px 8px', border: `1px solid ${colors.border}`, borderRadius: 4,
            background: 'transparent', color: colors.textMuted, cursor: 'pointer', fontSize: 10, fontFamily: 'inherit',
          }}>
            Export CSV
          </button>
        </div>
        {faultHistory.length === 0 && <div style={{ fontSize: 12, color: colors.textMuted }}>No faults recorded yet</div>}
        {faultHistory.slice(0, 10).map(f => (
          <div key={f.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: 12, borderBottom: `1px solid ${colors.border}` }}>
            <span style={{ color: f.acknowledged ? colors.textMuted : colors.warning }}>{f.fault_type}</span>
            <span style={{ color: colors.textMuted, fontSize: 11 }}>{formatTS(f.timestamp)}</span>
          </div>
        ))}
      </Card>

      {/* Pi system health */}
      <Card title="System Health (Pi)">
        {piHealth ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px', fontSize: 12 }}>
            <span style={{ color: colors.textMuted }}>CPU: <strong style={{ color: colors.text }}>{piHealth.cpu_pct}%</strong></span>
            <span style={{ color: colors.textMuted }}>Pi Temp: <strong style={{ color: colors.text }}>{piHealth.temp_c}°C</strong></span>
            <span style={{ color: colors.textMuted }}>Memory: <strong style={{ color: colors.text }}>{piHealth.mem_pct}%</strong></span>
            <span style={{ color: colors.textMuted }}>Disk: <strong style={{ color: colors.text }}>{piHealth.disk_pct}%</strong></span>
            <span style={{ color: colors.textMuted }}>Uptime: <strong style={{ color: colors.text }}>{piHealth.uptime_str}</strong></span>
          </div>
        ) : (
          <div style={{ fontSize: 12, color: colors.textMuted }}>Loading…</div>
        )}
      </Card>
    </div>
  )
}
