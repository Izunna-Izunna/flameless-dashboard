import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from 'recharts'
import { colors } from '../../styles/theme'
import { useStats } from '../../hooks/useStats'
import { api } from '../../services/api'

function StatBlock({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ padding: '4px 0' }}>
      <div style={{ fontSize: 10, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1 }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 700, color: colors.text, fontFamily: 'monospace' }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: colors.textMuted }}>{sub}</div>}
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

export default function StatsScreen() {
  const { runtime, energyHistory, efficiency, maintenance, piHealth: _ph, loading, refresh } = useStats()

  if (loading) return <div style={{ color: colors.textMuted, textAlign: 'center', marginTop: 40 }}>Loading statistics…</div>

  const chartData = [...(energyHistory ?? [])].reverse().slice(0, 14).map(d => ({
    date: d.date.slice(5),
    kwh: d.energy_kwh,
  }))

  return (
    <div className="touch-scroll">

      <Card title="Runtime Summary">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          <StatBlock label="Total Runtime"    value={`${(runtime?.total_runtime_hours ?? 0).toFixed(1)} h`} />
          <StatBlock label="Start Count"      value={`${runtime?.start_count ?? 0}`}                        sub="total starts" />
          <StatBlock label="Avg Run Time"     value={`${(runtime?.avg_runtime_hours ?? 0).toFixed(2)} h`}   sub="per start" />
          <StatBlock label="Longest Run"      value={`${(runtime?.longest_run_hours ?? 0).toFixed(1)} h`} />
          <StatBlock label="Availability"     value={`${runtime?.availability_pct ?? 0}%`}                  sub="uptime/requested" />
          <StatBlock label="Energy Produced"  value={`${(runtime?.total_energy_kwh ?? 0).toFixed(0)} kWh`} />
        </div>
      </Card>

      <Card title="Energy Production — Last 14 Days">
        <div style={{ height: 100 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
              <CartesianGrid stroke={colors.border} vertical={false} />
              <XAxis dataKey="date" tick={{ fill: colors.textMuted, fontSize: 9 }} axisLine={{ stroke: colors.border }} tickLine={false} />
              <YAxis tick={{ fill: colors.textMuted, fontSize: 9 }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ background: colors.surface, border: `1px solid ${colors.border}`, fontSize: 11, color: colors.text }}
                formatter={(v) => [`${Number(v).toFixed(1)} kWh`, 'Energy']}
              />
              <Bar dataKey="kwh" fill={colors.primary} radius={[3, 3, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card title="Fuel Efficiency">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <StatBlock label="Gas Used"          value={`${(efficiency?.natural_gas_m3 ?? 0).toFixed(0)} m³`} />
          <StatBlock label="Avg Consumption"   value={`${(efficiency?.avg_consumption_m3_hr ?? 0).toFixed(2)} m³/hr`} />
          <StatBlock label="Efficiency"        value={`${efficiency?.efficiency_pct ?? 0}%`}             sub="thermal → electrical" />
          <StatBlock label="Cost / kWh"        value={`₦${efficiency?.cost_per_kwh_ngn ?? 0}`}           sub="estimated" />
        </div>
      </Card>

      <Card title="Environmental Impact">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <StatBlock label="CO₂ Avoided"       value="551 kg"                                                sub="vs grid power" />
          <StatBlock label="Flare Gas Diverted" value={`${(efficiency?.natural_gas_m3 ?? 0).toFixed(0)} m³`} sub="not flared" />
        </div>
      </Card>

      <Card title="Maintenance Tracker">
        {(maintenance ?? []).map(m => (
          <div key={m.item} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: `1px solid ${colors.border}`, fontSize: 13 }}>
            <span style={{ color: colors.text }}>{m.item}</span>
            <span style={{ color: m.hours_remaining < 100 ? colors.warning : colors.textMuted, fontFamily: 'monospace', fontSize: 12 }}>
              {m.hours_remaining}h — {m.date_due}
            </span>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button onClick={refresh} style={{ padding: '4px 12px', border: `1px solid ${colors.border}`, borderRadius: 6, background: 'transparent', color: colors.textMuted, cursor: 'pointer', fontSize: 11, fontFamily: 'inherit' }}>
            Refresh
          </button>
          <button onClick={() => api.export.sensorsCsv()} style={{ padding: '4px 12px', border: `1px solid ${colors.border}`, borderRadius: 6, background: 'transparent', color: colors.textMuted, cursor: 'pointer', fontSize: 11, fontFamily: 'inherit' }}>
            Export Sensor CSV
          </button>
        </div>
      </Card>
    </div>
  )
}
