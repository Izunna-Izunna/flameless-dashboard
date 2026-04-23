/**
 * Real-time scrolling line chart – Power Output (kW) over time.
 */
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { SensorReading } from '../types/sensor'
import { colors } from '../styles/theme'

interface PowerChartProps {
  history: SensorReading[]
}

function formatTime(iso: string) {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`
}

export default function PowerChart({ history }: PowerChartProps) {
  const data = history.map((r) => ({
    t: formatTime(r.timestamp),
    kw: r.power_kw,
  }))

  return (
    <div
      style={{
        background: colors.surfaceAlt,
        border: `1px solid ${colors.border}`,
        borderRadius: 12,
        padding: '10px 16px 6px',
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: colors.textMuted,
          textTransform: 'uppercase',
          letterSpacing: 1,
          marginBottom: 4,
        }}
      >
        Power Output — kW (live)
      </div>

      <div style={{ flex: 1, minHeight: 0 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="kwGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={colors.chart} stopOpacity={0.3} />
                <stop offset="95%" stopColor={colors.chart} stopOpacity={0} />
              </linearGradient>
            </defs>

            <CartesianGrid stroke={colors.border} strokeDasharray="3 3" vertical={false} />

            <XAxis
              dataKey="t"
              tick={{ fill: colors.textMuted, fontSize: 9 }}
              interval="preserveStartEnd"
              tickLine={false}
              axisLine={{ stroke: colors.border }}
            />
            <YAxis
              domain={[190, 290]}
              tick={{ fill: colors.textMuted, fontSize: 10 }}
              tickLine={false}
              axisLine={false}
            />

            {/* Target line */}
            <ReferenceLine
              y={250}
              stroke={colors.primary}
              strokeDasharray="4 4"
              strokeOpacity={0.6}
              label={{ value: '250 kW', fill: colors.primary, fontSize: 9, position: 'insideTopRight' }}
            />

            <Tooltip
              contentStyle={{
                background: colors.surface,
                border: `1px solid ${colors.border}`,
                borderRadius: 6,
                fontSize: 12,
                color: colors.text,
              }}
              labelStyle={{ color: colors.textMuted }}
              formatter={(v) => [`${Number(v).toFixed(1)} kW`, 'Power']}
            />

            <Area
              type="monotone"
              dataKey="kw"
              stroke={colors.chart}
              strokeWidth={2}
              fill="url(#kwGrad)"
              dot={false}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
