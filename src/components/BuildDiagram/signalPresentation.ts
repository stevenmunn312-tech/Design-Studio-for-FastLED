// How each controller connection is labelled and coloured on the physical
// assembly diagram, shared by the diagram and its print sheets.

export interface PhysicalDiagramConnection {
  id: string
  itemId: string
  pinLabel: string
  useLabel: string
  boardAnchorId?: string
}

/** Caption for a profile drawn from primitives. A profile with a photoreal
 *  render carries its own `shortLabel` in CONTROLLER_RENDERS instead. */
export function shortBoardLabel(label: string) {
  if (label.includes('XIAO')) return 'XIAO ESP32S3'
  return 'ESP32-S3 N16R8'
}

export function formatAmps(valueMa: number) {
  return `${Number((valueMa / 1000).toFixed(valueMa % 1000 === 0 ? 0 : 1))}A`
}

export function connectionPinLabel(connection: PhysicalDiagramConnection) {
  return connection.pinLabel.replace('GPIO', 'IO')
}

type SignalPresentation = {
  role: string
  color: string
}

/**
 * Electrical roles own their colours. A MOSI run therefore stays magenta on
 * the controller, the wire, and every SPI module instead of changing colour
 * just because it belongs to a different item.
 */
export const SIGNAL_ROLE_COLORS = {
  bclk: '#176fd1',
  ws: '#df811c',
  dout: '#a33db8',
  sck: '#176fd1',
  mosi: '#c23b9d',
  miso: '#0f8b8d',
  cs: '#df811c',
  dc: '#7a3fb5',
  reset: '#d34f3f',
  irq: '#9a6700',
  sda: '#00866a',
  scl: '#4358dc',
  backlight: '#b47800',
  'control-a': '#0f8b8d',
  'control-b': '#4358dc',
  'control-switch': '#7a3fb5',
} as const

const EXCLUSIVE_SIGNAL_COLORS = [
  '#24963e',
  '#176fd1',
  '#c23b9d',
  '#df811c',
  '#0f8b8d',
  '#7a3fb5',
  '#b45f06',
  '#2f7f9f',
]

function stableSignalColor(value: string) {
  let hash = 0
  for (const character of value) hash = ((hash * 31) + character.charCodeAt(0)) >>> 0
  return EXCLUSIVE_SIGNAL_COLORS[hash % EXCLUSIVE_SIGNAL_COLORS.length]
}

function connectionPropertyKey(connection: PhysicalDiagramConnection) {
  return connection.id.slice(connection.id.lastIndexOf(':') + 1).toLowerCase()
}

export function signalPresentation(connection: PhysicalDiagramConnection): SignalPresentation {
  const key = connectionPropertyKey(connection)

  // I2S uses the same physical idea as a clocked bus, but keeping its familiar
  // BCLK/WS/DOUT labels makes the audio wiring easier to follow.
  if (key === 'i2ssck') return { role: 'bclk', color: SIGNAL_ROLE_COLORS.bclk }
  if (key === 'i2sws') return { role: 'ws', color: SIGNAL_ROLE_COLORS.ws }
  if (key === 'i2ssd') return { role: 'dout', color: SIGNAL_ROLE_COLORS.dout }

  if (key.includes('mosi') || key === 'dinpin') return { role: 'mosi', color: SIGNAL_ROLE_COLORS.mosi }
  if (key.includes('miso')) return { role: 'miso', color: SIGNAL_ROLE_COLORS.miso }
  if (key.includes('sck') || key === 'clkpin' || key === 'clockpin') return { role: 'sck', color: SIGNAL_ROLE_COLORS.sck }
  if (key.includes('cs')) return { role: 'cs', color: SIGNAL_ROLE_COLORS.cs }
  if (key === 'dcpin') return { role: 'dc', color: SIGNAL_ROLE_COLORS.dc }
  if (key.includes('reset')) return { role: 'reset', color: SIGNAL_ROLE_COLORS.reset }
  if (key.includes('irq')) return { role: 'irq', color: SIGNAL_ROLE_COLORS.irq }
  if (key === 'sdapin') return { role: 'sda', color: SIGNAL_ROLE_COLORS.sda }
  if (key === 'sclpin') return { role: 'scl', color: SIGNAL_ROLE_COLORS.scl }
  if (key.includes('backlight')) return { role: 'backlight', color: SIGNAL_ROLE_COLORS.backlight }
  if (key === 'pina') return { role: 'control-a', color: SIGNAL_ROLE_COLORS['control-a'] }
  if (key === 'pinb') return { role: 'control-b', color: SIGNAL_ROLE_COLORS['control-b'] }
  if (key === 'pinsw') return { role: 'control-switch', color: SIGNAL_ROLE_COLORS['control-switch'] }

  // Exclusive GPIO runs (LED data, buttons, HUB75 channels, etc.) are coloured
  // by their full connection id so neighbouring wires remain distinct without
  // implying that unrelated pins form a shared bus.
  return { role: key.replace(/pin$/, '') || 'signal', color: stableSignalColor(connection.id) }
}
