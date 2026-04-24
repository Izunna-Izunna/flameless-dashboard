import { colors } from '../../styles/theme'

export type Screen = 'home' | 'control' | 'sensors' | 'alerts' | 'stats' | 'dev'

interface Tab { id: Screen; label: string; icon: string }
const TABS: Tab[] = [
  { id: 'home',    label: 'Home',    icon: 'H' },
  { id: 'control', label: 'Control', icon: 'C' },
  { id: 'sensors', label: 'Sensors', icon: 'S' },
  { id: 'alerts',  label: 'Alerts',  icon: '!' },
  { id: 'stats',   label: 'Stats',   icon: '%' },
  { id: 'dev',     label: 'Dev',     icon: '⚙' },
]

interface Props {
  active: Screen
  onChange: (s: Screen) => void
  alertCount?: number
}

export default function Navigation({ active, onChange, alertCount = 0 }: Props) {
  return (
    <nav style={{
      display: 'flex', flexShrink: 0,
      background: colors.surface,
      borderTop: `1px solid ${colors.border}`,
      height: 48,
    }}>
      {TABS.map(tab => {
        const isActive = tab.id === active
        const showBadge = tab.id === 'alerts' && alertCount > 0
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            style={{
              flex: 1, border: 'none', background: 'none', cursor: 'pointer',
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', gap: 2, position: 'relative',
              borderTop: isActive ? `2px solid ${colors.primary}` : '2px solid transparent',
              transition: 'border-color 0.2s',
            }}
          >
            <span style={{
              fontSize: 15, fontWeight: 800,
              color: isActive ? colors.primary : colors.textMuted,
              fontFamily: 'monospace',
            }}>
              {tab.icon}
            </span>
            <span style={{
              fontSize: 10, letterSpacing: 0.5,
              color: isActive ? colors.primary : colors.textMuted,
            }}>
              {tab.label}
            </span>
            {showBadge && (
              <span style={{
                position: 'absolute', top: 4, right: '28%',
                background: colors.danger, color: '#fff',
                borderRadius: '50%', width: 16, height: 16,
                fontSize: 9, display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontWeight: 700,
              }}>
                {alertCount > 9 ? '9+' : alertCount}
              </span>
            )}
          </button>
        )
      })}
    </nav>
  )
}
