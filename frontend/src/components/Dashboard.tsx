import { useState, useEffect } from 'react'
import { colors } from '../styles/theme'
import { useWebSocket } from '../hooks/useWebSocket'
import { useAlerts } from '../hooks/useAlerts'
import Header from './shared/Header'
import Navigation, { type Screen } from './shared/Navigation'
import ScrollButtons from './shared/ScrollButtons'
import HomeScreen from './screens/HomeScreen'
import ControlScreen from './screens/ControlScreen'
import SensorsScreen from './screens/SensorsScreen'
import AlertsScreen from './screens/AlertsScreen'
import StatsScreen from './screens/StatsScreen'

const BOOT_MESSAGES = [
  'Initialising sensor interface…',
  'Calibrating ADS1115 ADC channels…',
  'Checking GPIO relay states…',
  'Loading state machine…',
  'Connecting to sensor stream…',
  'System ready.',
]

function LoadingOverlay() {
  const [msgIdx, setMsgIdx] = useState(0)
  const [progress, setProgress] = useState(0)

  // Cycle boot messages
  useEffect(() => {
    const interval = setInterval(() => {
      setMsgIdx(i => Math.min(i + 1, BOOT_MESSAGES.length - 1))
    }, 650)
    return () => clearInterval(interval)
  }, [])

  // Smooth progress bar to ~95% over 3.6s, holds until dismissed
  useEffect(() => {
    const interval = setInterval(() => {
      setProgress(p => {
        if (p >= 95) return p
        return p + (95 - p) * 0.06
      })
    }, 80)
    return () => clearInterval(interval)
  }, [])

  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 100,
      background: 'linear-gradient(160deg, #060910 0%, #0a0e1a 50%, #060c16 100%)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
    }}>

      {/* Background grid lines */}
      <div style={{
        position: 'absolute', inset: 0, opacity: 0.04,
        backgroundImage: `
          linear-gradient(${colors.primary} 1px, transparent 1px),
          linear-gradient(90deg, ${colors.primary} 1px, transparent 1px)
        `,
        backgroundSize: '40px 40px',
      }} />

      {/* Outer glow ring */}
      <div style={{
        position: 'relative', marginBottom: 32,
        width: 120, height: 120, display: 'flex',
        alignItems: 'center', justifyContent: 'center',
      }}>
        {/* Pulsing outer ring */}
        <div style={{
          position: 'absolute', inset: -12,
          borderRadius: '50%',
          border: `2px solid ${colors.primary}`,
          opacity: 0.25,
          animation: 'ringPulse 2s ease-in-out infinite',
        }} />
        {/* Inner ring */}
        <div style={{
          position: 'absolute', inset: 0,
          borderRadius: '50%',
          border: `1px solid ${colors.primary}44`,
        }} />
        {/* Flame logo */}
        <div style={{
          fontSize: 64, lineHeight: 1,
          filter: `drop-shadow(0 0 20px ${colors.primary}) drop-shadow(0 0 40px ${colors.primary}88)`,
          animation: 'flamePulse 2.5s ease-in-out infinite',
        }}>
          🔥
        </div>
      </div>

      {/* Title */}
      <div style={{
        fontSize: 36, fontWeight: 900, letterSpacing: 10,
        color: '#ffffff',
        textShadow: `0 0 30px ${colors.primary}, 0 0 60px ${colors.primary}66`,
        fontFamily: "'Inter', 'Roboto', system-ui, sans-serif",
        marginBottom: 6,
      }}>
        FLAMELESS
      </div>

      {/* Subtitle */}
      <div style={{
        fontSize: 11, letterSpacing: 4, color: colors.textMuted,
        textTransform: 'uppercase', marginBottom: 40,
        fontFamily: 'monospace',
      }}>
        Generator Monitoring System
      </div>

      {/* Progress bar */}
      <div style={{ width: 280, marginBottom: 12 }}>
        <div style={{
          width: '100%', height: 3,
          background: `${colors.primary}22`,
          borderRadius: 2, overflow: 'hidden',
        }}>
          <div style={{
            height: '100%',
            width: `${progress}%`,
            background: `linear-gradient(90deg, ${colors.primary}88, ${colors.primary})`,
            borderRadius: 2,
            transition: 'width 0.08s linear',
            boxShadow: `0 0 8px ${colors.primary}`,
          }} />
        </div>
      </div>

      {/* Boot message */}
      <div style={{
        fontSize: 11, color: `${colors.primary}cc`,
        fontFamily: 'monospace', letterSpacing: 0.5,
        height: 16,
      }}>
        {BOOT_MESSAGES[msgIdx]}
      </div>

      {/* Version tag */}
      <div style={{
        position: 'absolute', bottom: 24,
        fontSize: 10, color: colors.textMuted, letterSpacing: 1,
        fontFamily: 'monospace', opacity: 0.5,
      }}>
        v2.0 · Raspberry Pi 4B
      </div>

      <style>{`
        @keyframes ringPulse {
          0%, 100% { transform: scale(1);   opacity: 0.25; }
          50%       { transform: scale(1.1); opacity: 0.5;  }
        }
        @keyframes flamePulse {
          0%, 100% { transform: scale(1);    }
          50%       { transform: scale(1.08); }
        }
      `}</style>
    </div>
  )
}

export default function Dashboard() {
  const [screen, setScreen] = useState<Screen>('home')
  const { current, history, connected } = useWebSocket()
  const { activeAlerts } = useAlerts()
  const [minLoadDone, setMinLoadDone] = useState(false)

  // Minimum 4-second splash
  useEffect(() => {
    const t = setTimeout(() => setMinLoadDone(true), 4000)
    return () => clearTimeout(t)
  }, [])

  const showLoading = !current || !minLoadDone
  const state = current?.state ?? 'STOPPED'

  return (
    <div style={{
      position: 'relative', width: '100vw', height: '100vh',
      background: colors.dark, color: colors.text,
      fontFamily: "'Inter', 'Roboto', system-ui, sans-serif",
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      {showLoading && <LoadingOverlay />}

      {/* Fixed header */}
      <Header state={state} connected={connected} simulationMode={current?.simulation_mode} />

      {/* Screen content */}
      <div style={{ flex: 1, padding: '8px 10px', minHeight: 0, overflow: 'hidden' }}>
        {screen === 'home'    && <HomeScreen    current={current} history={history} />}
        {screen === 'control' && <ControlScreen current={current} />}
        {screen === 'sensors' && <SensorsScreen current={current} history={history} />}
        {screen === 'alerts'  && <AlertsScreen  current={current} />}
        {screen === 'stats'   && <StatsScreen />}
      </div>

      {/* Scroll buttons — only on screens with scrollable content */}
      {(screen === 'sensors' || screen === 'alerts' || screen === 'stats') && <ScrollButtons />}

      {/* Tab navigation */}
      <Navigation active={screen} onChange={setScreen} alertCount={activeAlerts.length} />
    </div>
  )
}
