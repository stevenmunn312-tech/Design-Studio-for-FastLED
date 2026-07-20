import type { StudioNode, StudioEdge } from '../state/graphStore'
import { SPI_CHIPSETS, NODE_LIBRARY, supportsScalarExpression } from '../state/nodeLibrary'
import { evaluateScalarExpression } from '../state/scalarExpression'
import { validateMatrixLayout } from '../state/xyLayout'
import { compositionDims } from '../state/outputRouting'

export interface ValidationResult {
  errors:   string[]
  warnings: string[]
}

interface PinUse { label: string; nodeId: string; pin: number }

// Every GPIO-typed property across the hardware-input/output nodes, tagged
// with a human label for the error message. MatrixOutput's clockPin only
// counts for SPI chipsets (it's unused, and its editor disabled, otherwise).
// There is no shared-bus concept in the generated firmware today — each of
// these pins drives exactly one peripheral — so any reuse of a GPIO number
// across two of these roles (even on the same node) is a real conflict.
function collectPinUses(nodes: StudioNode[]): PinUse[] {
  const uses: PinUse[] = []
  const matrixOutputs = nodes.filter((node) => node.data.nodeType === 'MatrixOutput')
  const matrixOrdinal = new Map(matrixOutputs.map((node, index) => [node.id, index + 1]))
  const push = (nodeId: string, label: string, value: unknown) => {
    if (typeof value === 'number' && Number.isFinite(value)) uses.push({ label, nodeId, pin: value })
  }
  for (const n of nodes) {
    const props = n.data.properties as Record<string, unknown>
    const baseLabel = String(n.data.label ?? n.data.nodeType)
    const label = n.data.nodeType === 'MatrixOutput' && matrixOutputs.length > 1
      ? `${baseLabel} ${matrixOrdinal.get(n.id)}`
      : baseLabel
    switch (n.data.nodeType) {
      case 'MicInput':
        push(n.id, `${label} I2S WS`, props.i2sWs)
        push(n.id, `${label} I2S SCK`, props.i2sSck)
        push(n.id, `${label} I2S SD`, props.i2sSd)
        break
      case 'MatrixOutput':
        push(n.id, `${label} data pin`, props.dataPin)
        if (SPI_CHIPSETS.has(String(props.chipset ?? 'WS2812B'))) push(n.id, `${label} clock pin`, props.clockPin)
        break
      case 'ButtonInput':
        push(n.id, `${label} pin`, props.pin)
        break
      case 'PotInput':
        push(n.id, `${label} pin`, props.pin)
        break
      case 'EncoderInput':
        push(n.id, `${label} pin A`, props.pinA)
        push(n.id, `${label} pin B`, props.pinB)
        push(n.id, `${label} switch pin`, props.pinSW)
        break
      case 'SDCard':
        push(n.id, `${label} CS pin`, props.sdCsPin)
        push(n.id, `${label} I2S BCLK`, props.i2sBclk)
        push(n.id, `${label} I2S LRC`, props.i2sLrc)
        push(n.id, `${label} I2S DOUT`, props.i2sDout)
        break
    }
  }
  return uses
}

// Nodes whose live preview reads a browser-only API with no embedded-hardware
// equivalent (mirrors the PREVIEW_NOTES on-node caption in StudioNode.tsx).
// The generated firmware always sees these nodes' idle default — a used one
// is worth flagging explicitly rather than letting the substitution pass
// silently.
const PREVIEW_ONLY_NODE_TYPES: ReadonlySet<string> = new Set(['MidiInput'])

export function findPreviewOnlyWarnings(nodes: StudioNode[], edges: StudioEdge[]): string[] {
  const used = nodes.filter(n =>
    PREVIEW_ONLY_NODE_TYPES.has(n.data.nodeType) && edges.some(e => e.source === n.id)
  )
  if (used.length === 0) return []
  const names = used.map(n => String(n.data.label ?? n.data.nodeType)).join(', ')
  return [`${names} ${used.length > 1 ? 'are' : 'is'} preview-only — the generated firmware will see the idle default instead of live input`]
}

export interface PowerEstimate {
  ledCount: number
  /** Worst-case draw if every LED shows full-white at once, in mA. */
  worstCaseMa: number
  /** `volts`/`milliamps` × configured cap, or null when `powerLimit` is off. */
  configuredMa: number | null
  /** Worst-case draw rounded up to a sane PSU-shopping figure. */
  recommendedMa: number
  /** True once a configured cap exists and worst case would exceed it. */
  exceedsConfigured: boolean
}

// Typical full-white draw for a WS2812-class LED at 5V (the number FastLED's
// own examples and most guides use). Real draw varies by chipset/voltage, but
// this is the right order of magnitude for a "will my PSU cope" estimate —
// exact chipset current draw isn't published widely enough to model per-part.
const MA_PER_LED_WORST_CASE = 60

export function estimatePowerLoad(nodes: StudioNode[]): PowerEstimate | null {
  const outputs = nodes.filter((node) => node.data.nodeType === 'MatrixOutput')
  if (outputs.length === 0) return null
  const ledCount = outputs.reduce((sum, output) => {
    const props = output.data.properties as Record<string, unknown>
    return sum + Math.max(0, Math.round(Number(props.width ?? 0))) * Math.max(0, Math.round(Number(props.height ?? 0)))
  }, 0)
  const worstCaseMa = ledCount * MA_PER_LED_WORST_CASE
  const capped = outputs.filter((output) => (output.data.properties as Record<string, unknown>).powerLimit === true)
  const configuredMa = capped.length > 0
    ? capped.reduce((sum, output) => sum + Number((output.data.properties as Record<string, unknown>).milliamps ?? 0), 0)
    : null
  const recommendedMa = Math.ceil(worstCaseMa / 100) * 100
  return {
    ledCount,
    worstCaseMa,
    configuredMa,
    recommendedMa,
    exceedsConfigured: configuredMa != null && worstCaseMa > configuredMa,
  }
}

export interface FirmwareRamEstimate {
  ledCount: number
  /** The physical `leds` CRGB array — always internal RAM, never PSRAM. */
  ledsArrayBytes: number
  /** Per-node `buf_<id>` CRGB render buffers reachable from MatrixOutput. */
  frameBufferBytes: number
  /** Per-node `field_<id>` float buffers reachable from MatrixOutput. */
  fieldBufferBytes: number
  /** Known simulation-node state beyond their own render buffer (heat maps,
   *  Game of Life cell grids, Reaction-Diffusion's u/v grids, particle pools,
   *  …) — these stay in internal RAM even when PSRAM is enabled (a noted
   *  follow-up in CLAUDE.md), so they're tracked separately from the buffers. */
  statefulBytes: number
  /** Whether MatrixOutput's `usePsram` is on (frame/field buffers move to PSRAM). */
  usesPsram: boolean
  /** RAM that must fit in the MCU's internal SRAM regardless of PSRAM. */
  internalBytes: number
  /** RAM offloaded to external PSRAM (0 when `usePsram` is off). */
  psramBytes: number
}

const OUTPUT_DATATYPES_BY_NODE_TYPE = new Map(
  NODE_LIBRARY.map((def) => [def.type, new Set(def.outputs.map((o) => o.dataType))])
)

// Extra `static` state a handful of simulation nodes allocate beyond their own
// frame/field render buffer — mirrors the arrays cppGenerator.ts emits for
// each (see the matching `case`). Not tracked for every node, just the ones
// with materially large fixed per-LED overhead.
const STATEFUL_EXTRA_BYTES_PER_LED: Record<string, number> = {
  Fire2012: 1,            // uint8 heat[HEIGHT][WIDTH]
  GameOfLife: 6,          // uint8 cells + uint8 next + float bright
  ReactionDiffusion: 16,  // 4 float arrays (u, v, un, vn)
  WaveSim: 12,            // 3 float arrays (p, c, n) beyond its own field buffer
}
// Particles uses a fixed-size pool independent of matrix size (see the
// `Particles` case in cppGenerator.ts): 6 floats + 3 uint8 per slot.
const PARTICLE_BYTES_PER_SLOT = 27
const PARTICLE_POOL_SIZE = (mode: string) => (mode === 'swarm' ? 40 : 120)

/**
 * Rough RAM budget for the generated sketch: the physical `leds` array plus
 * every frame/field render buffer reachable from MatrixOutput (unreached
 * nodes get no buffer in codegen, so isolated nodes don't inflate this), plus
 * known-heavy simulation-node state. Operates on the graph passed in (like
 * the rest of this module) — it does not recurse into group subgraphs.
 */
export function estimateFirmwareRam(nodes: StudioNode[], edges: StudioEdge[]): FirmwareRamEstimate | null {
  const outputs = nodes.filter((node) => node.data.nodeType === 'MatrixOutput')
  if (outputs.length === 0) return null
  const { w, h } = compositionDims(nodes)
  const ledCount = outputs.reduce((sum, output) => {
    const props = output.data.properties as Record<string, unknown>
    return sum + Math.max(0, Math.round(Number(props.width ?? 0))) * Math.max(0, Math.round(Number(props.height ?? 0)))
  }, 0)
  const renderLedCount = w * h

  // Only nodes that actually feed the terminal frame get a buffer in the
  // generated sketch — walk backward from MatrixOutput to find them.
  const incomingByTarget = new Map<string, StudioEdge[]>()
  for (const e of edges) {
    const list = incomingByTarget.get(e.target) ?? []
    list.push(e)
    incomingByTarget.set(e.target, list)
  }
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const reachable = new Set<string>()
  const stack = outputs.map((output) => output.id)
  while (stack.length) {
    const id = stack.pop()!
    if (reachable.has(id)) continue
    reachable.add(id)
    for (const e of incomingByTarget.get(id) ?? []) stack.push(e.source)
  }

  let frameBufferBytes = 0, fieldBufferBytes = 0, statefulBytes = 0
  for (const id of reachable) {
    const n = byId.get(id)
    if (!n) continue
    const outputTypes = OUTPUT_DATATYPES_BY_NODE_TYPE.get(n.data.nodeType)
    if (outputTypes?.has('frame')) frameBufferBytes += renderLedCount * 3
    if (outputTypes?.has('field')) fieldBufferBytes += renderLedCount * 4
    // ColorTrails' separable subpixel advection needs one intermediate CRGB
    // frame in addition to its persistent output buffer. Codegen declares it
    // as a normal render buffer, so PSRAM moves it together with the others.
    if (n.data.nodeType === 'ColorTrails') frameBufferBytes += renderLedCount * 3
    if (n.data.nodeType === 'SpectrumVisualizer') {
      // levels, peaks, peak velocity (float) + peak hold deadline (uint32)
      // are one value per rendered column; the waterfall reuses its frame buffer.
      statefulBytes += w * 16
    }

    const extraPerLed = STATEFUL_EXTRA_BYTES_PER_LED[n.data.nodeType]
    if (extraPerLed) statefulBytes += renderLedCount * extraPerLed
    if (n.data.nodeType === 'Particles') {
      const mode = String((n.data.properties as Record<string, unknown>)?.particleType ?? 'fountain')
      statefulBytes += PARTICLE_POOL_SIZE(mode) * PARTICLE_BYTES_PER_SLOT
    }
    if (n.data.nodeType === 'FrameFeedback') {
      const delay = Math.max(1, Math.min(32, Math.round(Number((n.data.properties as Record<string, unknown>)?.delayFrames ?? 2))))
      // Ring buffer stores `delay` previous outputs plus the slot currently
      // being written, and stays internal even when ordinary render buffers
      // are moved to PSRAM.
      statefulBytes += renderLedCount * 3 * (delay + 1)
    }
  }

  const ledsArrayBytes = ledCount * 3
  const usesPsram = outputs.some((output) => (output.data.properties as Record<string, unknown>).usePsram === true)
  const psramBytes = usesPsram ? frameBufferBytes + fieldBufferBytes : 0
  const internalBytes = ledsArrayBytes + statefulBytes + (usesPsram ? 0 : frameBufferBytes + fieldBufferBytes)

  return { ledCount, ledsArrayBytes, frameBufferBytes, fieldBufferBytes, statefulBytes, usesPsram, internalBytes, psramBytes }
}

// A conservative "worth a heads-up" threshold for classic ESP32-class internal
// SRAM (WiFi/BT stacks and the rest of the app already claim a large share of
// the ~300–500 KB total) — not a hard board-specific limit.
const INTERNAL_RAM_WARN_BYTES = 40_000

export function findPinConflicts(nodes: StudioNode[]): string[] {
  const byPin = new Map<number, string[]>()
  for (const { label, pin } of collectPinUses(nodes)) {
    const labels = byPin.get(pin) ?? []
    labels.push(label)
    byPin.set(pin, labels)
  }
  const conflicts: string[] = []
  for (const [pin, labels] of byPin) {
    if (labels.length > 1) conflicts.push(`GPIO ${pin} is assigned to more than one pin: ${labels.join(', ')}`)
  }
  return conflicts.sort()
}

export function findMatrixLayoutErrors(nodes: StudioNode[]): string[] {
  return nodes.filter((node) => node.data.nodeType === 'MatrixOutput').flatMap((output, index) => {
    const props = output.data.properties as Record<string, unknown>
    const width = Math.max(0, Math.round(Number(props.width ?? 0)))
    const height = Math.max(0, Math.round(Number(props.height ?? 0)))
    const base = String(output.data.label ?? output.data.nodeType)
    const label = nodes.filter((node) => node.data.nodeType === 'MatrixOutput').length > 1 ? `${base} ${index + 1}` : base
    return validateMatrixLayout(width, height, props).map((message) => `${label}: ${message}`)
  })
}

export function findBoardCompatibilityErrors(nodes: StudioNode[], selectedFqbn: string): string[] {
  if (!selectedFqbn || !nodes.some((node) => node.data.nodeType === 'MicInput')) return []
  if (selectedFqbn.startsWith('esp32:')) return []
  return ['Microphone firmware requires an ESP32-family board because INMP441 capture uses the ESP-IDF I2S driver']
}

export function findScalarExpressionErrors(nodes: StudioNode[]): string[] {
  const { w: width, h: height } = compositionDims(nodes)
  const errors: string[] = []

  for (const node of nodes) {
    const props = node.data.properties as Record<string, unknown>
    for (const [key, value] of Object.entries(props)) {
      if (
        typeof value === 'string' &&
        supportsScalarExpression(node.data.nodeType, key) &&
        evaluateScalarExpression(value, width, height) == null
      ) {
        errors.push(`${node.data.label} ${key} has an invalid numeric expression: ${value || '(empty)'}`)
      }
    }
  }
  return errors
}

/** FastLED's power limiter is global across all registered controllers, so
 * independently capped routes must agree on supply voltage; their mA budgets
 * are then summed into one controller-wide cap. */
export function findOutputResourceErrors(nodes: StudioNode[]): string[] {
  const capped = nodes.filter((node) =>
    node.data.nodeType === 'MatrixOutput' && (node.data.properties as Record<string, unknown>).powerLimit === true
  )
  const volts = [...new Set(capped.map((node) => Number((node.data.properties as Record<string, unknown>).volts ?? 5)))]
  return volts.length > 1
    ? [`Matrix outputs with power limits must use one shared supply voltage (found ${volts.join(' V, ')} V)`]
    : []
}

export type GraphDiagnosticSeverity = 'error' | 'warning'
export type GraphDiagnosticCategory =
  | 'connection'
  | 'expression'
  | 'pins'
  | 'layout'
  | 'preview'
  | 'power'
  | 'memory'
  | 'board'
  | 'show'

export type GraphDiagnosticAction = 'open-node-library' | 'choose-board'

export interface GraphDiagnostic {
  id: string
  severity: GraphDiagnosticSeverity
  category: GraphDiagnosticCategory
  title: string
  message: string
  fix: string
  /** Every visible node involved in the issue. The drawer frames the whole set
   *  and selects the first node, so conflicts are as easy to trace as one-node
   *  property errors. */
  nodeIds: string[]
  nodeLabel?: string
  propertyKey?: string
  action?: GraphDiagnosticAction
}

export interface GraphDiagnosticOptions {
  selectedFqbn?: string
  /** Group subgraphs terminate at GroupOutput rather than MatrixOutput. */
  target?: 'matrix' | 'group'
}

const POWER_WARN_MA = 5_000

function nodeLabel(node: StudioNode): string {
  return String(node.data.label ?? node.data.nodeType)
}

/**
 * Rich, continuously consumable validation for editor UI. `validateGraph`
 * intentionally keeps its compact string result for deploy callers; this
 * companion supplies stable ids, node attribution, and concrete remediation.
 */
export function buildGraphDiagnostics(
  nodes: StudioNode[],
  edges: StudioEdge[],
  options: GraphDiagnosticOptions = {},
): GraphDiagnostic[] {
  const diagnostics: GraphDiagnostic[] = []
  const target = options.target ?? 'matrix'
  const terminalType = target === 'group' ? 'GroupOutput' : 'MatrixOutput'
  const terminalName = target === 'group' ? 'Group Output' : 'Matrix Output'
  const terminals = nodes.filter((node) => node.data.nodeType === terminalType)
  const terminal = terminals[0]
  const incoming = new Set(edges.filter((edge) => edge.target && edge.targetHandle).map((edge) => `${edge.target}:${edge.targetHandle}`))

  if (nodes.length === 0) {
    diagnostics.push({
      id: 'graph-empty', severity: 'error', category: 'connection',
      title: 'Canvas is empty',
      message: 'There is no signal path to preview or deploy.',
      fix: target === 'group' ? 'Return to the main graph and recreate this group.' : 'Add a starter patch or drag nodes from the node library.',
      nodeIds: [], action: 'open-node-library',
    })
    return diagnostics
  }

  if (!terminal) {
    diagnostics.push({
      id: `missing-${terminalType}`, severity: 'error', category: 'connection',
      title: `${terminalName} is missing`,
      message: `This ${target === 'group' ? 'group' : 'graph'} has no terminal for its rendered frame.`,
      fix: target === 'group' ? 'Recreate the group so it receives a Group Output terminal.' : 'Add one Matrix Output node from the Output section.',
      nodeIds: [], action: target === 'matrix' ? 'open-node-library' : undefined,
    })
  } else {
    for (const candidate of terminals) {
      const connected = target === 'group'
        ? incoming.has(`${candidate.id}:frame`)
        : incoming.has(`${candidate.id}:frame`) || incoming.has(`${candidate.id}:sdcard`)
      if (connected) continue
      diagnostics.push({
        id: `${candidate.id}-input`, severity: 'error', category: 'connection',
        title: `${terminalName} has no input`,
        message: target === 'group'
          ? 'Nothing is connected to the group frame terminal.'
          : 'Neither a Frame nor an SD Card signal reaches the output.',
        fix: target === 'group'
          ? 'Connect the pattern’s final Frame output to Group Output.'
          : 'Connect a Frame output, or wire an SD Card node to the SD Card input.',
        nodeIds: [candidate.id], nodeLabel: nodeLabel(candidate),
      })
    }
  }

  const usesByPin = new Map<number, PinUse[]>()
  for (const use of collectPinUses(nodes)) {
    const uses = usesByPin.get(use.pin) ?? []
    uses.push(use)
    usesByPin.set(use.pin, uses)
  }
  for (const [pin, uses] of [...usesByPin].sort(([a], [b]) => a - b)) {
    if (uses.length < 2) continue
    diagnostics.push({
      id: `pin-${pin}`, severity: 'error', category: 'pins',
      title: `GPIO ${pin} is assigned twice`,
      message: uses.map((use) => use.label).join(' · '),
      fix: 'Assign a unique GPIO number to every listed hardware role.',
      nodeIds: [...new Set(uses.map((use) => use.nodeId))],
      nodeLabel: uses.length === 2 ? uses.map((use) => use.label).join(' / ') : `${uses.length} pin roles`,
    })
  }
  const cappedOutputs = nodes.filter((node) => node.data.nodeType === 'MatrixOutput' && (node.data.properties as Record<string, unknown>).powerLimit === true)
  const outputResourceErrors = findOutputResourceErrors(nodes)
  if (outputResourceErrors.length > 0) {
    diagnostics.push({
      id: 'outputs-power-voltage', severity: 'error', category: 'power',
      title: 'Output power voltages disagree',
      message: outputResourceErrors[0],
      fix: 'Use the same supply voltage for every power-limited output; their current budgets are summed.',
      nodeIds: cappedOutputs.map((node) => node.id),
      nodeLabel: `${cappedOutputs.length} output routes`,
    })
  }

  const matrixOutputs = nodes.filter((node) => node.data.nodeType === 'MatrixOutput')
  const matrixOutput = matrixOutputs[0]
  for (const matrixOutput of matrixOutputs) {
    const props = matrixOutput.data.properties as Record<string, unknown>
    const width = Math.max(0, Math.round(Number(props.width ?? 0)))
    const height = Math.max(0, Math.round(Number(props.height ?? 0)))
    validateMatrixLayout(width, height, props).forEach((message, index) => {
      diagnostics.push({
        id: `${matrixOutput.id}-layout-${index}`, severity: 'error', category: 'layout',
        title: 'Matrix layout is invalid', message,
        fix: 'Correct the panel grid, rotations, or custom XY map in Matrix Output layout controls.',
        nodeIds: [matrixOutput.id], nodeLabel: nodeLabel(matrixOutput),
      })
    })
  }

  const { w: expressionWidth, h: expressionHeight } = compositionDims(nodes)
  for (const node of nodes) {
    const props = node.data.properties as Record<string, unknown>
    for (const [key, value] of Object.entries(props)) {
      if (
        typeof value === 'string' &&
        supportsScalarExpression(node.data.nodeType, key) &&
        evaluateScalarExpression(value, expressionWidth, expressionHeight) == null
      ) {
        diagnostics.push({
          id: `${node.id}-expression-${key}`, severity: 'error', category: 'expression',
          title: `${nodeLabel(node)} has an invalid expression`,
          message: `${key}: ${value || '(empty)'}`,
          fix: `Replace “${key}” with a number or a valid expression using W, H, min, max, abs, floor, ceil, round, or clamp.`,
          nodeIds: [node.id], nodeLabel: nodeLabel(node), propertyKey: key,
        })
      }
    }
  }

  for (const node of nodes) {
    if (!PREVIEW_ONLY_NODE_TYPES.has(node.data.nodeType) || !edges.some((edge) => edge.source === node.id)) continue
    diagnostics.push({
      id: `${node.id}-preview-only`, severity: 'warning', category: 'preview',
      title: `${nodeLabel(node)} works only in preview`,
      message: 'Generated firmware receives this node’s idle default instead of its live browser input.',
      fix: 'Replace it with a hardware input node, or disconnect it before generating firmware.',
      nodeIds: [node.id], nodeLabel: nodeLabel(node),
    })
  }

  const power = estimatePowerLoad(nodes)
  if (matrixOutput && power?.exceedsConfigured) {
    diagnostics.push({
      id: `${matrixOutput.id}-power-cap`, severity: 'warning', category: 'power',
      title: 'Worst-case draw exceeds the power cap',
      message: `About ${power.worstCaseMa} mA for ${power.ledCount} LEDs versus a ${power.configuredMa} mA cap; FastLED will auto-dim.`,
      fix: 'Keep the cap and expect dimming, or reduce LED count/brightness before raising it to a supply-safe value.',
      nodeIds: [matrixOutput.id], nodeLabel: nodeLabel(matrixOutput),
    })
  } else if (matrixOutput && power && power.configuredMa == null && power.worstCaseMa >= POWER_WARN_MA) {
    diagnostics.push({
      id: `${matrixOutput.id}-power-unlimited`, severity: 'warning', category: 'power',
      title: 'High-current output has no power cap',
      message: `Worst-case full white is about ${power.worstCaseMa} mA for ${power.ledCount} LEDs.`,
      fix: 'Enable Power limit on Matrix Output and enter the continuous current rating of the LED power supply.',
      nodeIds: [matrixOutput.id], nodeLabel: nodeLabel(matrixOutput),
    })
  }

  const ram = estimateFirmwareRam(nodes, edges)
  if (matrixOutput && ram && !ram.usesPsram && ram.internalBytes > INTERNAL_RAM_WARN_BYTES) {
    diagnostics.push({
      id: `${matrixOutput.id}-memory`, severity: 'warning', category: 'memory',
      title: 'Internal RAM estimate is high',
      message: `Render buffers need roughly ${Math.round(ram.internalBytes / 1024)} KB before framework and network overhead.`,
      fix: 'Choose a PSRAM-capable ESP32 board and enable Use PSRAM, or reduce matrix size and buffer-heavy nodes.',
      nodeIds: [matrixOutput.id], nodeLabel: nodeLabel(matrixOutput),
    })
  }

  if (options.selectedFqbn && !options.selectedFqbn.startsWith('esp32:')) {
    for (const node of nodes.filter((entry) => entry.data.nodeType === 'MicInput')) {
      diagnostics.push({
        id: `${node.id}-board`, severity: 'error', category: 'board',
        title: 'Microphone is incompatible with the selected board',
        message: 'INMP441 capture uses the ESP-IDF I2S driver and cannot compile for this target.',
        fix: 'Choose an ESP32-family board in Board & Port, or remove the Microphone node.',
        nodeIds: [node.id], nodeLabel: nodeLabel(node), action: 'choose-board',
      })
    }
  }

  const master = nodes.find((node) => node.data.nodeType === 'PatternMaster')
  if (master && !incoming.has(`${master.id}:patternset`)) {
    diagnostics.push({
      id: `${master.id}-patterns`, severity: 'warning', category: 'show',
      title: 'Show Engine has no patterns',
      message: 'No Pattern Collection is wired to the show engine.',
      fix: 'Connect a Pattern Collection pattern-set output to the Show Engine.',
      nodeIds: [master.id], nodeLabel: nodeLabel(master),
    })
  }

  const perfGen = nodes.find((node) => node.data.nodeType === 'PerformanceGenerator')
  if (perfGen && incoming.has(`${perfGen.id}:patternset`)) {
    const link = edges.find((edge) => edge.target === perfGen.id && edge.targetHandle === 'patternset')
    const collection = link && nodes.find((node) => node.id === link.source && node.data.nodeType === 'PatternCollection')
    const patternIds = collection ? ((collection.data.properties as { patternIds?: string[] }).patternIds ?? []) : []
    if (!incoming.has(`${perfGen.id}:music`)) {
      diagnostics.push({
        id: `${perfGen.id}-music`, severity: 'warning', category: 'show',
        title: 'Performance Generator has no music source',
        message: 'It has patterns, but no analysed music to drive the show.',
        fix: 'Connect a Music Library output to the Performance Generator music input.',
        nodeIds: [perfGen.id], nodeLabel: nodeLabel(perfGen),
      })
    }
    if (collection && patternIds.length === 0) {
      diagnostics.push({
        id: `${collection.id}-empty`, severity: 'warning', category: 'show',
        title: 'Pattern Collection is empty',
        message: 'The connected collection cannot produce a show without patterns.',
        fix: 'Add at least one saved pattern to this Pattern Collection.',
        nodeIds: [collection.id], nodeLabel: nodeLabel(collection),
      })
    }
  }

  for (const node of nodes) {
    if (
      node.data.nodeType === terminalType ||
      node.data.nodeType === 'Comment' ||
      edges.some((edge) => edge.source === node.id || edge.target === node.id)
    ) continue
    diagnostics.push({
      id: `${node.id}-disconnected`, severity: 'warning', category: 'connection',
      title: `${nodeLabel(node)} is disconnected`,
      message: 'This node does not send or receive any signal.',
      fix: 'Connect one of its outputs to a compatible downstream input, or remove the unused node.',
      nodeIds: [node.id], nodeLabel: nodeLabel(node),
    })
  }

  return diagnostics
}

export function validateGraph(nodes: StudioNode[], edges: StudioEdge[], selectedFqbn = ''): ValidationResult {
  const errors: string[] = [], warnings: string[] = []
  if (nodes.length === 0) { errors.push('No nodes in graph'); return { errors, warnings } }

  const hasOutput = nodes.some(n => n.data.nodeType === 'MatrixOutput')
  if (!hasOutput) errors.push('Missing MatrixOutput node')

  const incoming = new Set(edges.filter(e => e.target && e.targetHandle).map(e => `${e.target}:${e.targetHandle}`))
  if (hasOutput) {
    const outputs = nodes.filter(n => n.data.nodeType === 'MatrixOutput')
    for (const [index, out] of outputs.entries()) {
      const hasFrameInput = incoming.has(`${out.id}:frame`)
      const hasSdCardInput = incoming.has(`${out.id}:sdcard`)
      if (!hasFrameInput && !hasSdCardInput) {
        errors.push(outputs.length === 1
          ? 'MatrixOutput has no Frame or SD Card input connected'
          : `MatrixOutput ${index + 1} has no Frame or SD Card input connected`)
      }
    }
  }

  errors.push(...findPinConflicts(nodes))
  errors.push(...findOutputResourceErrors(nodes))
  errors.push(...findMatrixLayoutErrors(nodes))
  errors.push(...findScalarExpressionErrors(nodes))
  errors.push(...findBoardCompatibilityErrors(nodes, selectedFqbn))
  warnings.push(...findPreviewOnlyWarnings(nodes, edges))

  const power = estimatePowerLoad(nodes)
  if (power?.exceedsConfigured) {
    warnings.push(
      `Worst-case draw (~${power.worstCaseMa} mA for ${power.ledCount} LEDs) exceeds the configured power cap (${power.configuredMa} mA) — FastLED will auto-dim to stay under it`
    )
  }

  const ram = estimateFirmwareRam(nodes, edges)
  if (ram && !ram.usesPsram && ram.internalBytes > INTERNAL_RAM_WARN_BYTES) {
    warnings.push(
      `Estimated internal RAM for render buffers (~${Math.round(ram.internalBytes / 1024)} KB) is large for many boards — consider enabling MatrixOutput's "Use PSRAM" toggle if the selected board supports it`
    )
  }

  const master = nodes.find(n => n.data.nodeType === 'PatternMaster')
  if (master && !incoming.has(`${master.id}:patternset`)) {
    warnings.push('Show Engine has no Pattern Collection wired')
  }

  // Music-sync generator: a wired Pattern Collection needs a direct music
  // source on the generator, and an empty collection produces nothing.
  const perfGen = nodes.find(n => n.data.nodeType === 'PerformanceGenerator')
  if (perfGen && incoming.has(`${perfGen.id}:patternset`)) {
    const link = edges.find(e => e.target === perfGen.id && e.targetHandle === 'patternset')
    const coll = link && nodes.find(n => n.id === link.source && n.data.nodeType === 'PatternCollection')
    const ids = coll ? ((coll.data.properties as { patternIds?: string[] }).patternIds ?? []) : []
    if (!incoming.has(`${perfGen.id}:music`)) {
      warnings.push('Performance Generator has a Pattern Collection but no music source wired')
    }
    if (coll && ids.length === 0) {
      warnings.push('Pattern Collection wired to Performance Generator is empty')
    }
  }

  const isolated = nodes.filter(n =>
    n.data.nodeType !== 'MatrixOutput' &&
    n.data.nodeType !== 'Comment' &&
    !edges.some(e => e.source === n.id || e.target === n.id)
  )
  if (isolated.length > 0)
    warnings.push(`${isolated.length} node${isolated.length > 1 ? 's' : ''} not connected to anything`)

  return { errors, warnings }
}
