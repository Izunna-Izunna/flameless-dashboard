export const colors = {
  primary:      '#ff6b35',
  dark:         '#0a0e14',
  surface:      '#1a2130',
  surfaceAlt:   '#16213e',
  border:       '#2a3a5a',
  text:         '#c8d8e8',
  textMuted:    '#6a8aaa',
  success:      '#00ff88',
  warning:      '#ffd700',
  danger:       '#ff3b3b',
  info:         '#00d4ff',
  chart:        '#38bdf8',
  chartFill:    'rgba(56,189,248,0.08)',
  stateStopped: '#666688',
  stateStarting:'#ffd700',
  stateRunning: '#00ff88',
  stateStopping:'#ff8800',
  stateFault:   '#ff3b3b',
  btnStart:     '#00cc66',
  btnStop:      '#ff8800',
  btnEstop:     '#ff3b3b',
}

export const gaugeRanges = {
  power:    { min: 0,  max: 12,   target: 7.5  },
  temp:     { min: 20, max: 100,  target: 75   },
  rpm:      { min: 0,  max: 2000, target: 1500 },
  pressure: { min: 0,  max: 10,   target: 4.5  },
}

export function stateColor(s: string): string {
  switch (s) {
    case 'RUNNING':  return colors.stateRunning
    case 'STARTING': return colors.stateStarting
    case 'STOPPING': return colors.stateStopping
    case 'FAULT':    return colors.stateFault
    default:         return colors.stateStopped
  }
}
