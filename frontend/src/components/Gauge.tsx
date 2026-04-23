/**
 * Semi-circular SVG gauge.
 * Arc spans 180° (left to right along the bottom).
 */
import { colors } from '../styles/theme'

interface GaugeProps {
  label: string
  value: number
  unit: string
  min: number
  max: number
  /** Optional warning threshold (fraction 0-1 of range) */
  warnAt?: number
  /** Optional danger threshold (fraction 0-1 of range) */
  dangerAt?: number
  decimals?: number
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

function polarToXY(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  }
}

function arcPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number) {
  const start = polarToXY(cx, cy, r, startDeg)
  const end = polarToXY(cx, cy, r, endDeg)
  const largeArc = endDeg - startDeg > 180 ? 1 : 0
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`
}

const START_DEG = 135   // left-bottom
const END_DEG   = 405   // right-bottom  (270° sweep)

export default function Gauge({
  label,
  value,
  unit,
  min,
  max,
  warnAt = 0.75,
  dangerAt = 0.90,
  decimals = 1,
}: GaugeProps) {
  const CX = 80
  const CY = 80
  const R  = 62

  const fraction = Math.max(0, Math.min(1, (value - min) / (max - min)))
  const valueDeg = lerp(START_DEG, END_DEG, fraction)

  // Arc colour based on fraction
  let arcColor = colors.success
  if (fraction >= dangerAt) arcColor = colors.danger
  else if (fraction >= warnAt) arcColor = colors.warning

  // Needle tip
  const tip = polarToXY(CX, CY, R - 6, valueDeg)
  const base1 = polarToXY(CX, CY, 8, valueDeg - 90)
  const base2 = polarToXY(CX, CY, 8, valueDeg + 90)

  return (
    <div
      style={{
        background: colors.surfaceAlt,
        border: `1px solid ${colors.border}`,
        borderRadius: 12,
        padding: '12px 8px 8px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        minWidth: 160,
        flex: 1,
      }}
    >
      <svg width={160} height={110} viewBox="0 0 160 110">
        {/* Track */}
        <path
          d={arcPath(CX, CY, R, START_DEG, END_DEG)}
          fill="none"
          stroke={colors.border}
          strokeWidth={10}
          strokeLinecap="round"
        />
        {/* Value arc */}
        <path
          d={arcPath(CX, CY, R, START_DEG, valueDeg)}
          fill="none"
          stroke={arcColor}
          strokeWidth={10}
          strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 0.4s ease, stroke 0.4s ease' }}
        />
        {/* Needle */}
        <polygon
          points={`${tip.x},${tip.y} ${base1.x},${base1.y} ${base2.x},${base2.y}`}
          fill={arcColor}
          opacity={0.85}
          style={{ transition: 'all 0.4s ease' }}
        />
        {/* Hub */}
        <circle cx={CX} cy={CY} r={5} fill={colors.text} />

        {/* Min / Max labels */}
        <text x={18} y={106} fill={colors.textMuted} fontSize={10} textAnchor="middle">{min}</text>
        <text x={142} y={106} fill={colors.textMuted} fontSize={10} textAnchor="middle">{max}</text>
      </svg>

      {/* Value readout */}
      <div
        style={{
          fontSize: 30,
          fontWeight: 700,
          color: arcColor,
          lineHeight: 1,
          transition: 'color 0.4s ease',
        }}
      >
        {value.toFixed(decimals)}
      </div>
      <div style={{ fontSize: 13, color: colors.textMuted, marginTop: 2 }}>{unit}</div>
      <div
        style={{
          fontSize: 12,
          color: colors.text,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: 1,
          marginTop: 4,
        }}
      >
        {label}
      </div>
    </div>
  )
}
