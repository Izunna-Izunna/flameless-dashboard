import { useCallback, useEffect, useRef, useState } from 'react'
import { colors } from '../../styles/theme'
import { api } from '../../services/api'

/* ── types ─────────────────────────────────────────────────────────────── */
interface GpioRaw {
  hardware_active:      boolean
  simulation_mode:      boolean
  relay_gas:            boolean
  relay_starter:        boolean
  relay_engine_stop:    boolean
  relay_spare:          boolean
  adc_a0_pressure_bar:  number | null
  adc_a1_mq4_pct:       number | null
  adc_a2_voltage_v:     number | null
  adc_a3_current_a:     number | null
  din_estop:            boolean | null
  din_gas_leak:         boolean | null
  ds18b20_c:            number | null
  rpm_raw:              number | null
  state:                string
}

/* ── colour helpers ─────────────────────────────────────────────────────── */
const C = colors

/* ── sub-components ─────────────────────────────────────────────────────── */

function Section({ title, children, accent }: {
  title: string; children: React.ReactNode; accent?: string
}) {
  return (
    <div style={{
      background: C.surfaceAlt, border: `1px solid ${accent ?? C.border}`,
      borderRadius: 10, padding: '10px 12px', marginBottom: 8,
    }}>
      <div style={{
        fontSize: 10, letterSpacing: 2, fontWeight: 800,
        color: accent ?? C.textMuted, textTransform: 'uppercase', marginBottom: 8,
      }}>
        {title}
      </div>
      {children}
    </div>
  )
}

function RelayToggle({ label, gpio, name, active, onChange, danger }: {
  label: string; gpio: number; name: string
  active: boolean; onChange: (name: string, v: boolean) => void
  danger?: boolean
}) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '6px 0', borderBottom: `1px solid ${C.border}`,
    }}>
      <div>
        <span style={{ fontSize: 13, color: C.text, fontWeight: 600 }}>{label}</span>
        <span style={{ fontSize: 10, color: C.textMuted, marginLeft: 6 }}>GPIO{gpio}</span>
      </div>
      <button
        onClick={() => onChange(name, !active)}
        style={{
          minWidth: 64, padding: '5px 0', borderRadius: 8, fontFamily: 'inherit',
          fontSize: 12, fontWeight: 800, letterSpacing: 1, cursor: 'pointer',
          border: `1.5px solid ${active ? (danger ? C.danger : C.success) : C.border}`,
          background: active ? (danger ? `${C.danger}22` : `${C.success}22`) : 'transparent',
          color: active ? (danger ? C.danger : C.success) : C.textMuted,
          transition: 'all 0.15s',
        }}
      >
        {active ? '● ON' : '○ OFF'}
      </button>
    </div>
  )
}

function RawRow({ label, value, unit, ok, nullLabel = 'N/A' }: {
  label: string; value: number | boolean | null | undefined
  unit?: string; ok?: boolean; nullLabel?: string
}) {
  const isNull   = value === null || value === undefined
  const isBool   = typeof value === 'boolean'
  const display  = isNull
    ? nullLabel
    : isBool
      ? (value ? 'YES' : 'NO')
      : `${(value as number).toFixed(typeof value === 'number' && value < 10 ? 2 : 1)}${unit ?? ''}`
  const colour = isNull ? C.textMuted
    : isBool ? (value ? (ok === false ? C.danger : C.success) : (ok === false ? C.success : C.textMuted))
    : ok === false ? C.danger : ok === true ? C.success : C.text

  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: 12 }}>
      <span style={{ color: C.textMuted }}>{label}</span>
      <span style={{ color: colour, fontWeight: 600, fontFamily: 'monospace' }}>{display}</span>
    </div>
  )
}

/* ── main component ─────────────────────────────────────────────────────── */
export default function DevScreen() {
  const [raw, setRaw]         = useState<GpioRaw | null>(null)
  const [choke, setChoke]     = useState(100)
  const [feedback, setFeedback] = useState('')
  const [busy, setBusy]       = useState<string | null>(null)
  const timerRef              = useRef<ReturnType<typeof setTimeout> | null>(null)

  /* Poll gpio-raw every 1.5 s */
  const fetchRaw = useCallback(() => {
    api.control.gpioRaw()
      .then(d => setRaw(d))
      .catch(() => {})
  }, [])

  useEffect(() => {
    fetchRaw()
    const id = setInterval(fetchRaw, 1500)
    return () => clearInterval(id)
  }, [fetchRaw])

  function fb(msg: string) {
    setFeedback(msg)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setFeedback(''), 4000)
  }

  async function toggleRelay(name: string, state: boolean) {
    setBusy(name)
    try {
      const r = await api.control.relay(name, state)
      fb(r.message ?? `${name} → ${state ? 'ON' : 'OFF'}`)
      fetchRaw()
    } catch { fb('Error') }
    finally { setBusy(null) }
  }

  async function sendChoke(pct: number) {
    setBusy('choke')
    try {
      const r = await api.control.choke(pct)
      fb(r.message ?? `Choke ${pct}%`)
    } catch { fb('Choke error') }
    finally { setBusy(null) }
  }

  async function allOff() {
    setBusy('all')
    try {
      await Promise.all([
        api.control.relay('starter', false),
        api.control.relay('gas',     false),
        api.control.relay('stop',    false),
        api.control.relay('spare',   false),
      ])
      fb('⚡ All relays cut OFF')
      fetchRaw()
    } catch { fb('Error cutting relays') }
    finally { setBusy(null) }
  }

  const hw = raw?.hardware_active ?? false

  return (
    <div className="touch-scroll" style={{ padding: '0 2px' }}>

      {/* ── Warning banner ── */}
      <div style={{
        background: `${C.warning}18`, border: `1px solid ${C.warning}66`,
        borderRadius: 8, padding: '6px 12px', marginBottom: 8,
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <span style={{ fontSize: 18 }}>⚠</span>
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, color: C.warning, letterSpacing: 1 }}>
            DEVELOPER / DIAGNOSTIC MODE
          </div>
          <div style={{ fontSize: 10, color: C.textMuted }}>
            Direct hardware control — bypasses state machine interlocks
          </div>
        </div>
        <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
          <div style={{ fontSize: 10, color: hw ? C.success : C.warning, fontWeight: 700 }}>
            {hw ? '● HARDWARE' : '◌ SIMULATION'}
          </div>
          <div style={{ fontSize: 10, color: C.textMuted }}>
            {raw?.state ?? '…'}
          </div>
        </div>
      </div>

      {/* ── ALL OFF safety button ── */}
      <button
        onClick={allOff}
        disabled={busy === 'all'}
        style={{
          width: '100%', minHeight: 44, marginBottom: 8, borderRadius: 8, fontFamily: 'inherit',
          fontSize: 14, fontWeight: 800, letterSpacing: 2, cursor: 'pointer',
          border: `2px solid ${C.danger}`,
          background: `${C.danger}22`, color: C.danger,
          transition: 'all 0.15s',
        }}
      >
        ⚡ ALL RELAYS OFF
      </button>

      {/* ── Feedback bar ── */}
      {feedback && (
        <div style={{
          padding: '6px 12px', borderRadius: 8, marginBottom: 8, fontSize: 12,
          background: `${C.info}18`, border: `1px solid ${C.info}66`, color: C.info,
        }}>
          {feedback}
        </div>
      )}

      {/* ── Relay control ── */}
      <Section title="Relay Control" accent={C.warning}>
        <RelayToggle label="Gas Solenoid"  gpio={17} name="gas"     active={raw?.relay_gas         ?? false} onChange={toggleRelay} danger />
        <RelayToggle label="Starter Motor" gpio={27} name="starter" active={raw?.relay_starter      ?? false} onChange={toggleRelay} danger />
        <RelayToggle label="Engine Stop"   gpio={22} name="stop"    active={raw?.relay_engine_stop  ?? false} onChange={toggleRelay} danger />
        <RelayToggle label="Spare Relay"   gpio={5}  name="spare"   active={raw?.relay_spare        ?? false} onChange={toggleRelay} />
      </Section>

      {/* ── Choke servo ── */}
      <Section title="Choke Servo (GPIO18 PWM)">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <input
            type="range" min={0} max={100} step={5} value={choke}
            onChange={e => setChoke(Number(e.target.value))}
            style={{ flex: 1, accentColor: C.primary }}
          />
          <span style={{ fontSize: 13, color: C.text, fontFamily: 'monospace', minWidth: 42 }}>
            {choke}%
          </span>
          <button
            onClick={() => sendChoke(choke)}
            disabled={busy === 'choke'}
            style={{
              padding: '4px 14px', borderRadius: 6, fontFamily: 'inherit',
              fontSize: 12, fontWeight: 700, cursor: 'pointer',
              border: `1px solid ${C.primary}`,
              background: `${C.primary}22`, color: C.primary,
            }}
          >
            Set
          </button>
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
          {[0, 25, 50, 75, 100].map(v => (
            <button key={v} onClick={() => { setChoke(v); sendChoke(v) }} style={{
              flex: 1, padding: '3px 0', borderRadius: 4, fontFamily: 'inherit',
              fontSize: 11, cursor: 'pointer',
              border: `1px solid ${choke === v ? C.primary : C.border}`,
              background: choke === v ? `${C.primary}22` : 'transparent',
              color: choke === v ? C.primary : C.textMuted,
            }}>
              {v}%
            </button>
          ))}
        </div>
      </Section>

      {/* ── Digital inputs ── */}
      <Section title="Digital Inputs (live)">
        <RawRow label="E-Stop (GPIO24)"   value={raw?.din_estop}    ok={false} nullLabel={hw ? 'reading…' : 'sim'} />
        <RawRow label="Gas Leak (GPIO23)" value={raw?.din_gas_leak} ok={false} nullLabel={hw ? 'reading…' : 'sim'} />
      </Section>

      {/* ── ADC channels ── */}
      <Section title="ADS1115 ADC Channels (live)">
        <RawRow label="A0 — Pressure"     value={raw?.adc_a0_pressure_bar} unit=" bar" nullLabel={hw ? 'no ADS1115' : 'sim'} />
        <RawRow label="A1 — MQ-4 Gas"     value={raw?.adc_a1_mq4_pct}      unit="%"   nullLabel={hw ? 'no ADS1115' : 'sim'} />
        <RawRow label="A2 — AC Voltage"   value={raw?.adc_a2_voltage_v}    unit=" V"  nullLabel={hw ? 'no ADS1115' : 'sim'} />
        <RawRow label="A3 — AC Current"   value={raw?.adc_a3_current_a}    unit=" A"  nullLabel={hw ? 'no ADS1115' : 'sim'} />
      </Section>

      {/* ── Other sensors ── */}
      <Section title="Other Sensors (live)">
        <RawRow label="DS18B20 (GPIO4)"   value={raw?.ds18b20_c}  unit="°C" nullLabel={hw ? 'not wired' : 'sim'} />
        <RawRow label="RPM (GPIO25 Hall)" value={raw?.rpm_raw}    unit=" RPM" nullLabel={hw ? 'stopped' : 'sim'} />
      </Section>

    </div>
  )
}
