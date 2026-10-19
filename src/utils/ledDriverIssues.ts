/**
 * Graph Health for the Board's LED driver choice (HW-32 step 7).
 *
 * Advice with a fix, never a refusal, and red only where the sketch cannot
 * work: a chosen driver that needs a peripheral another part already holds.
 * Every card's fix puts the Board back on FastLED's own driver, which is
 * always available. Wire time and the parallel-driver suggestion live in
 * `wireTime.ts`; this file only judges a driver already chosen.
 */
import type { StudioNode } from '../state/graphStore'
import { outputForm } from '../state/output/ledOutputForm'
import { selectedLedDriver } from '../build/ledDriverSelection'
import { CHIPSET_WIRE, LED_DRIVER_AUTO, type SelectableLedDriver } from '../build/ledDrivers'
import { LED_DRIVER_CHANNEL_TIMING } from '../codegen/output/ledDriverCpp'
import type { GraphDiagnostic, GraphDiagnosticFix } from './validateGraph'

/** Parts that run the ESP32's I2S peripheral for audio. */
const I2S_AUDIO_NODE_TYPES: ReadonlySet<string> = new Set(['MicInput', 'LineInput', 'Amplifier'])

interface ClocklessLane {
  node: StudioNode
  chipset: string
}

function label(node: StudioNode): string {
  return String(node.data.label ?? node.data.nodeType)
}

function props(node: StudioNode): Record<string, unknown> {
  return node.data.properties as Record<string, unknown>
}

/** Every clockless output the driver would send: LED outputs (not HUB75) and VU rails. */
function clocklessLanes(nodes: readonly StudioNode[]): ClocklessLane[] {
  const lanes: ClocklessLane[] = []
  for (const node of nodes) {
    const type = node.data.nodeType
    if (type !== 'MatrixOutput' && type !== 'StereoVuMeter') continue
    if (type === 'MatrixOutput' && outputForm(props(node)) === 'hub75') continue
    const chipset = String(props(node).chipset ?? 'WS2812B')
    if (CHIPSET_WIRE[chipset]?.kind !== 'clockless') continue
    lanes.push({ node, chipset })
  }
  return lanes
}

/** Lanes clocked together must agree on bit period and bits per LED. */
function timingKey(chipset: string): string {
  const wire = CHIPSET_WIRE[chipset]
  return wire?.kind === 'clockless' ? `${wire.bitNs}/${wire.bitsPerLed}` : chipset
}

const backToAuto: GraphDiagnosticFix = { action: 'set-led-driver', repair: { kind: 'set-led-driver', ledDriver: LED_DRIVER_AUTO } }

function peripheralConflicts(nodes: readonly StudioNode[], driver: SelectableLedDriver, boardId: string): GraphDiagnostic[] {
  const issues: GraphDiagnostic[] = []
  const hub75 = nodes.filter((node) => node.data.nodeType === 'MatrixOutput' && outputForm(props(node)) === 'hub75')
  const audio = nodes.filter((node) => I2S_AUDIO_NODE_TYPES.has(node.data.nodeType))
  if (driver.peripheral === 'LCD_CAM' && hub75.length > 0) {
    issues.push({
      id: 'led-driver-lcd-cam-hub75', severity: 'error', category: 'board',
      title: 'The LED driver and the HUB75 panel both need LCD_CAM',
      message: `The Board's ${driver.label} LED driver sends through the ESP32-S3's LCD_CAM peripheral, which the HUB75 panel library also drives ${hub75.map(label).join(', ')} with. The chip has one.`,
      fix: 'Put the Board back on FastLED\'s own LED driver (RMT), which leaves LCD_CAM to the panel.',
      nodeIds: [boardId, ...hub75.map((node) => node.id)], nodeLabel: 'Board', propertyKey: 'ledDriver',
      ...backToAuto,
    })
  }
  if (driver.peripheral === 'I2S0' && audio.length > 0) {
    issues.push({
      id: 'led-driver-i2s-audio', severity: 'error', category: 'board',
      title: 'The LED driver and the audio parts both need I2S',
      message: `The Board's ${driver.label} LED driver programs the classic ESP32's I2S0 peripheral directly, and ${audio.map(label).join(', ')} run audio through I2S with ESP-IDF's own driver. The two cannot share it, and ESP-IDF 5 stops at boot when its old and new I2S drivers meet.`,
      fix: 'Put the Board back on FastLED\'s own LED driver (RMT), which leaves I2S to the audio.',
      nodeIds: [boardId, ...audio.map((node) => node.id)], nodeLabel: 'Board', propertyKey: 'ledDriver',
      ...backToAuto,
    })
  }
  if (driver.peripheral === 'I2S0' && hub75.length > 0) {
    issues.push({
      id: 'led-driver-i2s-hub75', severity: 'warning', category: 'board',
      title: 'The LED driver and the HUB75 panel both use I2S',
      message: `The Board's ${driver.label} LED driver takes the classic ESP32's I2S0 and the HUB75 panel library drives ${hub75.map(label).join(', ')} from I2S1. They are separate peripherals, but the two drivers have not been run together.`,
      fix: 'If the panel or the LEDs glitch, put the Board back on FastLED\'s own LED driver (RMT).',
      nodeIds: [boardId, ...hub75.map((node) => node.id)], nodeLabel: 'Board', propertyKey: 'ledDriver',
      ...backToAuto,
    })
  }
  return issues
}

/** Graph Health cards for the Board's chosen LED driver, from root-graph nodes. */
export function ledDriverDiagnostics(nodes: readonly StudioNode[]): GraphDiagnostic[] {
  const driver = selectedLedDriver(nodes)
  const board = nodes.find((node) => node.data.nodeType === 'Board')
  if (!driver || !board) return []
  const issues = peripheralConflicts(nodes, driver, board.id)
  const lanes = clocklessLanes(nodes)

  if (driver.sharedTiming) {
    const timings = new Map<string, string[]>()
    for (const lane of lanes) {
      const key = timingKey(lane.chipset)
      timings.set(key, [...new Set([...(timings.get(key) ?? []), lane.chipset])])
    }
    if (timings.size > 1) {
      const chipsets = [...timings.values()].map((names) => names.join(' / ')).join(', ')
      issues.push({
        id: 'led-driver-mixed-timing', severity: 'warning', category: 'board',
        title: 'Parallel lanes need one LED timing',
        message: `The ${driver.label} LED driver clocks every output together, so all of them must share one chipset timing. These outputs use ${chipsets}.`,
        fix: 'Give every output the same chipset if the strips allow it, or put the Board back on FastLED\'s own LED driver, which times each output on its own.',
        nodeIds: [board.id, ...new Set(lanes.map((lane) => lane.node.id))], nodeLabel: 'Board', propertyKey: 'ledDriver',
        ...backToAuto,
      })
    }
  }

  if (driver.selection === 'exclusive') {
    const left = lanes.filter((lane) => !LED_DRIVER_CHANNEL_TIMING[lane.chipset])
    if (left.length > 0) {
      issues.push({
        id: 'led-driver-unsupported-chipset', severity: 'warning', category: 'board',
        title: 'Some outputs stay on the default LED driver',
        message: `${[...new Set(left.map((lane) => label(lane.node)))].join(', ')} use ${[...new Set(left.map((lane) => lane.chipset))].join(', ')}, which the ${driver.label} driver cannot take, so ${left.length === 1 ? 'it keeps' : 'they keep'} FastLED's own driver while the rest move.`,
        fix: 'Nothing to change if that is fine. Otherwise choose another chipset for them, or put the Board back on FastLED\'s own LED driver.',
        nodeIds: [board.id, ...new Set(left.map((lane) => lane.node.id))], nodeLabel: 'Board', propertyKey: 'ledDriver',
        ...backToAuto,
      })
    }
  }
  return issues
}

/** The error cards as deploy-gate sentences, the same findings Graph Health shows. */
export function findLedDriverErrors(nodes: readonly StudioNode[]): string[] {
  return ledDriverDiagnostics(nodes)
    .filter((issue) => issue.severity === 'error')
    .map((issue) => `${issue.title}. ${issue.fix}`)
}
