import { useEffect, useState } from 'react'
import { colors, stateColor } from '../../styles/theme'
import type { SensorReading } from '../../types/sensor'
import type { PreCheck, ControlStatus } from '../../types/control'
import { useGeneratorControl } from '../../hooks/useGeneratorControl'
import { api } from '../../services/api'

interface Props { current: SensorReading | null }

function BigButton({ label, sub, color, onClick, disabled }: {
  label: string; sub: string; color: string
  onClick: () => void; disabled?: boolean
}) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      width: '100%', minHeight: 64, border: `2px solid ${disabled ? colors.border : color}`,
      background: disabled ? `${colors.border}22` : `${color}22`,
      color: disabled ? colors.textMuted : color, borderRadius: 10,
      cursor: disabled ? 'not-allowed' : 'pointer', padding: '8px 16px',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      transition: 'all 0.2s', fontFamily: 'inherit',
    }}>
      <span style={{ fontSize: 16, fontWeight: 800, letterSpacing: 1 }}>{label}</span>
      <span style={{ fontSize: 11, opacity: 0.8, marginTop: 2 }}>{sub}</span>
    </button>
  )
}

function CheckRow({ check }: { check: PreCheck }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0' }}>
      <span style={{ color: check.passed ? colors.success : colors.danger, fontSize: 13, fontWeight: 700, width: 16 }}>
        {check.passed ? '✓' : '✗'}
      </span>
      <span style={{ fontSize: 12, color: check.passed ? colors.text : colors.danger }}>{check.name}</span>
    </div>
  )
}

function RelayRow({ label, gpio, name, state, onToggle }: {
  label: string; gpio: number; name: string; state: boolean; onToggle: (name: string, v: boolean) => void
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0' }}>
      <span style={{ fontSize: 12, color: colors.textMuted }}>{label} (GPIO{gpio})</span>
      <button onClick={() => onToggle(name, !state)} style={{
        padding: '3px 12px', borderRadius: 12, border: `1px solid ${state ? colors.warning : colors.border}`,
        background: state ? `${colors.warning}33` : 'transparent', color: state ? colors.warning : colors.textMuted,
        cursor: 'pointer', fontSize: 11, fontWeight: 700, fontFamily: 'inherit',
      }}>
        {state ? 'ON' : 'OFF'}
      </button>
    </div>
  )
}

export default function ControlScreen({ current }: Props) {
  const { start, stop, estop, reset, toggleRelay, loading } = useGeneratorControl()
  const [status, setStatus] = useState<ControlStatus | null>(null)
  const [feedback, setFeedback] = useState<string>('')
  const [simMode, setSimMode] = useState<boolean | null>(null)
  const [hwAvailable, setHwAvailable] = useState(false)

  const state = current?.state ?? 'STOPPED'

  useEffect(() => {
    const refresh = () => api.control.status().then(setStatus).catch(() => {})
    refresh()
    const id = setInterval(refresh, 2000)
    return () => clearInterval(id)
  }, [])

  // Fetch mode on mount
  useEffect(() => {
    fetch('/api/system/mode').then(r => r.json()).then(d => {
      setSimMode(d.simulation_mode)
      setHwAvailable(d.hardware_available)
    }).catch(() => {})
  }, [])

  async function toggleMode() {
    const newSim = !simMode
    const r = await fetch('/api/system/mode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ simulation: newSim }),
    }).then(res => res.json())
    if (r.ok) {
      setSimMode(r.simulation_mode)
      setFeedback(r.simulation_mode ? 'Switched to SIMULATION mode' : 'Switched to REAL HARDWARE mode — GPIO active')
    } else {
      setFeedback(`Cannot switch: ${r.error}`)
    }
    setTimeout(() => setFeedback(''), 5000)
  }

  async function handle(fn: () => Promise<{ success: boolean; message: string }>) {
    const r = await fn()
    setFeedback(r.message)
    setTimeout(() => setFeedback(''), 4000)
  }

  const stopsRemaining = current?.stop_ticks_remaining ?? status?.stop_ticks_remaining ?? null
  const cooldownSecs = stopsRemaining !== null ? stopsRemaining * 2 : null

  return (
    <div style={{ display: 'flex', height: '100%', gap: 8 }}>
      {/* LEFT: Status + pre-checks */}
      <div style={{ width: 280, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ background: colors.surfaceAlt, border: `1px solid ${colors.border}`, borderRadius: 8, padding: 10 }}>
          <div style={{ fontSize: 11, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
            Generator State
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, color: stateColor(state), marginBottom: 8 }}>{state}</div>

          {state === 'STARTING' && (
            <div style={{ fontSize: 13, color: colors.stateStarting }}>
              Cranking… RPM: {current?.rpm?.toFixed(0) ?? 0}
            </div>
          )}
          {state === 'STOPPING' && cooldownSecs !== null && (
            <div style={{ fontSize: 13, color: colors.stateStopping }}>
              Cooling down… {cooldownSecs}s remaining
            </div>
          )}
          {state === 'FAULT' && (
            <div style={{ fontSize: 12, color: colors.danger }}>
              {current?.fault_reason ?? 'Fault detected'}
            </div>
          )}
        </div>

        {/* Pre-checks */}
        <div style={{ background: colors.surfaceAlt, border: `1px solid ${colors.border}`, borderRadius: 8, padding: 10, flex: 1 }}>
          <div style={{ fontSize: 11, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
            Pre-Start Checks
          </div>
          {(status?.pre_checks ?? []).map(c => <CheckRow key={c.name} check={c} />)}
          {!status && <div style={{ fontSize: 12, color: colors.textMuted }}>Loading…</div>}
        </div>

        {/* Relay toggles */}
        <div style={{ background: colors.surfaceAlt, border: `1px solid ${colors.border}`, borderRadius: 8, padding: 10 }}>
          <div style={{ fontSize: 11, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
            Manual Relays
          </div>
          <RelayRow label="Starter" gpio={22} name="starter" state={current?.starter_relay ?? false} onToggle={(n, v) => handle(() => toggleRelay(n, v))} />
          <RelayRow label="Gas Valve" gpio={27} name="gas" state={current?.gas_solenoid ?? false} onToggle={(n, v) => handle(() => toggleRelay(n, v))} />
          <RelayRow label="Spare" gpio={5} name="spare" state={current?.spare_relay ?? false} onToggle={(n, v) => handle(() => toggleRelay(n, v))} />
        </div>
      </div>

      {/* RIGHT: Control buttons */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10, justifyContent: 'center' }}>
        <BigButton
          label="▶  START GENERATOR"
          sub={status?.all_checks_pass ? 'All pre-checks passing' : 'Pre-checks not met'}
          color={colors.btnStart}
          disabled={loading || state !== 'STOPPED' || !status?.all_checks_pass}
          onClick={() => handle(start)}
        />
        <BigButton
          label="■  STOP GENERATOR"
          sub="60s cooldown period"
          color={colors.btnStop}
          disabled={loading || state !== 'RUNNING'}
          onClick={() => handle(stop)}
        />
        <BigButton
          label="⚠  EMERGENCY STOP"
          sub="Immediate shutdown — emergencies only"
          color={colors.btnEstop}
          disabled={loading || state === 'STOPPED' || state === 'FAULT'}
          onClick={() => handle(estop)}
        />
        {state === 'FAULT' && (
          <BigButton
            label="↺  RESET FAULT"
            sub="Clear fault and return to STOPPED"
            color={colors.info}
            disabled={loading}
            onClick={() => handle(reset)}
          />
        )}

        {feedback && (
          <div style={{ padding: '8px 12px', background: `${colors.info}22`, border: `1px solid ${colors.info}`, borderRadius: 8, fontSize: 13, color: colors.info }}>
            {feedback}
          </div>
        )}

        {/* System section */}
        <div style={{ marginTop: 'auto', paddingTop: 8, borderTop: `1px solid ${colors.border}`, display: 'flex', flexDirection: 'column', gap: 6 }}>

          {/* Mode toggle */}
          <div style={{ background: colors.surfaceAlt, border: `1px solid ${colors.border}`, borderRadius: 8, padding: '8px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: simMode ? colors.warning : colors.success }}>
                {simMode ? '⚠ SIMULATION MODE' : '● REAL HARDWARE'}
              </div>
              <div style={{ fontSize: 10, color: colors.textMuted, marginTop: 2 }}>
                {hwAvailable ? 'GPIO & sensors detected' : 'No hardware detected'}
              </div>
            </div>
            <button
              onClick={toggleMode}
              disabled={!hwAvailable}
              style={{
                padding: '5px 14px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                fontFamily: 'inherit', cursor: hwAvailable ? 'pointer' : 'not-allowed',
                border: `1px solid ${simMode ? colors.success : colors.warning}`,
                background: 'transparent',
                color: hwAvailable ? (simMode ? colors.success : colors.warning) : colors.textMuted,
                opacity: hwAvailable ? 1 : 0.5,
              }}
            >
              {simMode ? 'Use Real HW' : 'Use Sim'}
            </button>
          </div>

          {/* Exit kiosk */}
          <button
            onClick={async () => {
              if (!window.confirm('Exit kiosk mode and return to desktop?')) return
              await fetch('/api/system/exit-kiosk', { method: 'POST' }).catch(() => {})
            }}
            style={{
              width: '100%', minHeight: 44, border: `1px solid ${colors.border}`,
              background: 'transparent', color: colors.textMuted, borderRadius: 8,
              cursor: 'pointer', fontSize: 13, fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            ⬛ Exit Kiosk
          </button>
        </div>
      </div>
    </div>
  )
}
