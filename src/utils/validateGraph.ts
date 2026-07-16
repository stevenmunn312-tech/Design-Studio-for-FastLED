import type { StudioNode, StudioEdge } from '../state/graphStore'
import { SPI_CHIPSETS, NODE_LIBRARY, supportsScalarExpression } from '../state/nodeLibrary'
import { evaluateScalarExpression } from '../state/scalarExpression'
import { validateMatrixLayout } from '../state/xyLayout'

export interface ValidationResult {
  errors:   string[]
  warnings: string[]
}

interface PinUse { label: string; pin: number }

// Every GPIO-typed property across the hardware-input/output nodes, tagged
// with a human label for the error message. MatrixOutput's clockPin only
// counts for SPI chipsets (it's unused, and its editor disabled, otherwise).
// There is no shared-bus concept in the generated firmware today — each of
// these pins drives exactly one peripheral — so any reuse of a GPIO number
// across two of these roles (even on the same node) is a real conflict.
function collectPinUses(nodes: StudioNode[]): PinUse[] {
  const uses: PinUse[] = []
  const push = (label: string, value: unknown) => {
    if (typeof value === 'number' && Number.isFinite(value)) uses.push({ label, pin: value })
  }
  for (const n of nodes) {
    const props = n.data.properties as Record<string, unknown>
    const label = String(n.data.label ?? n.data.nodeType)
    switch (n.data.nodeType) {
      case 'MicInput':
        push(`${label} I2S WS`, props.i2sWs)
        push(`${label} I2S SCK`, props.i2sSck)
        push(`${label} I2S SD`, props.i2sSd)
        break
      case 'MatrixOutput':
        push(`${label} data pin`, props.dataPin)
        if (SPI_CHIPSETS.has(String(props.chipset ?? 'WS2812B'))) push(`${label} clock pin`, props.clockPin)
        break
      case 'ButtonInput':
        push(`${label} pin`, props.pin)
        break
      case 'PotInput':
        push(`${label} pin`, props.pin)
        break
      case 'EncoderInput':
        push(`${label} pin A`, props.pinA)
        push(`${label} pin B`, props.pinB)
        push(`${label} switch pin`, props.pinSW)
        break
      case 'SDCard':
        push(`${label} CS pin`, props.sdCsPin)
        push(`${label} I2S BCLK`, props.i2sBclk)
        push(`${label} I2S LRC`, props.i2sLrc)
        push(`${label} I2S DOUT`, props.i2sDout)
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
  const out = nodes.find(n => n.data.nodeType === 'MatrixOutput')
  if (!out) return null
  const props = out.data.properties as Record<string, unknown>
  const w = Math.max(0, Math.round(Number(props.width ?? 0)))
  const h = Math.max(0, Math.round(Number(props.height ?? 0)))
  const ledCount = w * h
  const worstCaseMa = ledCount * MA_PER_LED_WORST_CASE
  const configuredMa = props.powerLimit === true ? Number(props.milliamps ?? 0) : null
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
  const out = nodes.find((n) => n.data.nodeType === 'MatrixOutput')
  if (!out) return null
  const outProps = out.data.properties as Record<string, unknown>
  const w = Math.max(0, Math.round(Number(outProps.width ?? 0)))
  const h = Math.max(0, Math.round(Number(outProps.height ?? 0)))
  const ledCount = w * h

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
  const stack = [out.id]
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
    if (outputTypes?.has('frame')) frameBufferBytes += ledCount * 3
    if (outputTypes?.has('field')) fieldBufferBytes += ledCount * 4
    // ColorTrails' separable subpixel advection needs one intermediate CRGB
    // frame in addition to its persistent output buffer. Codegen declares it
    // as a normal render buffer, so PSRAM moves it together with the others.
    if (n.data.nodeType === 'ColorTrails') frameBufferBytes += ledCount * 3
    if (n.data.nodeType === 'SpectrumVisualizer') {
      // levels, peaks, peak velocity (float) + peak hold deadline (uint32)
      // are one value per rendered column; the waterfall reuses its frame buffer.
      statefulBytes += w * 16
    }

    const extraPerLed = STATEFUL_EXTRA_BYTES_PER_LED[n.data.nodeType]
    if (extraPerLed) statefulBytes += ledCount * extraPerLed
    if (n.data.nodeType === 'Particles') {
      const mode = String((n.data.properties as Record<string, unknown>)?.particleType ?? 'fountain')
      statefulBytes += PARTICLE_POOL_SIZE(mode) * PARTICLE_BYTES_PER_SLOT
    }
    if (n.data.nodeType === 'FrameFeedback') {
      const delay = Math.max(1, Math.min(32, Math.round(Number((n.data.properties as Record<string, unknown>)?.delayFrames ?? 2))))
      // Ring buffer stores `delay` previous outputs plus the slot currently
      // being written, and stays internal even when ordinary render buffers
      // are moved to PSRAM.
      statefulBytes += ledCount * 3 * (delay + 1)
    }
  }

  const ledsArrayBytes = ledCount * 3
  const usesPsram = outProps.usePsram === true
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
  const output = nodes.find((n) => n.data.nodeType === 'MatrixOutput')
  if (!output) return []
  const props = output.data.properties as Record<string, unknown>
  const width = Math.max(0, Math.round(Number(props.width ?? 0)))
  const height = Math.max(0, Math.round(Number(props.height ?? 0)))
  const label = String(output.data.label ?? output.data.nodeType)
  return validateMatrixLayout(width, height, props).map((message) => `${label}: ${message}`)
}

export function findBoardCompatibilityErrors(nodes: StudioNode[], selectedFqbn: string): string[] {
  if (!selectedFqbn || !nodes.some((node) => node.data.nodeType === 'MicInput')) return []
  if (selectedFqbn.startsWith('esp32:')) return []
  return ['Microphone firmware requires an ESP32-family board because INMP441 capture uses the ESP-IDF I2S driver']
}

export function findScalarExpressionErrors(nodes: StudioNode[]): string[] {
  const output = nodes.find((n) => n.data.nodeType === 'MatrixOutput')
  const outputProps = output?.data.properties as Record<string, unknown> | undefined
  const scale = outputProps?.supersample === true ? 2 : 1
  const width = Math.max(1, Number(outputProps?.width ?? 16)) * scale
  const height = Math.max(1, Number(outputProps?.height ?? 16)) * scale
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

export function validateGraph(nodes: StudioNode[], edges: StudioEdge[]): ValidationResult {
  const errors: string[] = [], warnings: string[] = []
  if (nodes.length === 0) { errors.push('No nodes in graph'); return { errors, warnings } }

  const hasOutput = nodes.some(n => n.data.nodeType === 'MatrixOutput')
  if (!hasOutput) errors.push('Missing MatrixOutput node')

  const incoming = new Set(edges.filter(e => e.target && e.targetHandle).map(e => `${e.target}:${e.targetHandle}`))
  if (hasOutput) {
    const out = nodes.find(n => n.data.nodeType === 'MatrixOutput')!
    const hasFrameInput = incoming.has(`${out.id}:frame`)
    const hasSdCardInput = incoming.has(`${out.id}:sdcard`)
    if (!hasFrameInput && !hasSdCardInput) errors.push('MatrixOutput has no Frame or SD Card input connected')
  }

  errors.push(...findPinConflicts(nodes))
  errors.push(...findMatrixLayoutErrors(nodes))
  errors.push(...findScalarExpressionErrors(nodes))
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
