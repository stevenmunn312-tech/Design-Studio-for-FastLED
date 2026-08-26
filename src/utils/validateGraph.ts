import type { StudioNode, StudioEdge } from '../state/graphStore'
import { isPortlessNodeType, NODE_LIBRARY, supportsScalarExpression } from '../state/nodeLibrary'
import { isLinearForm, outputForm, outputLedTotal } from '../state/ledOutputForm'
import { audioOutputMissing } from '../state/audioOutput'
import { resolveShowTarget } from '../state/showTarget'
import { evaluateScalarExpression } from '../state/scalarExpression'
import { isNodeFormulaValid } from '../state/formulaLang'
import { isValidRtcDateTime } from '../state/rtc'
import { buildXYTable, validateMatrixLayout, tileRotationAt } from '../state/xyLayout'
import { compositionDims, leadingOutputRoutes, outputMirrorLeaders, outputRoutes } from '../state/outputRouting'
import { boardGpioInfo } from '../state/uploadStore'
import { MAX_PIN_NUMBER, pinSupports } from '../state/boardGpio'
import { getNetworkCredentials } from '../state/networkCredentials'
import { collectPinUses } from '../build/hardwareManifest'
import { browserThumbnailIssues } from './browserThumbnails'
import { playerDisplaysFromGraph } from '../codegen/playerDisplays'
import {
  findPinCollisions, findI2cAddressCollisions, pinCollisionMessage,
  pinCollisionTitle, pinCollisionFix, addressCollisionMessage,
  busAssignmentFor,
} from '../state/busTopology'
import { boardPinVerdict, boardProfileById } from '../build/boardProfiles'
import type { PhysicalBoardProfile } from '../build/boardProfiles'
import { inmp441SupportedForBoard, INMP441_UNSUPPORTED_MESSAGE } from '../state/micPinDefaults'
import { controllerSettings } from '../state/controllerSettings'
import { resolveAudioCapabilitySource } from '../state/audioCapabilities'
import { resolveStorageCapabilitySource } from '../state/storageCapabilities'

export interface ValidationResult {
  errors:   string[]
  warnings: string[]
}

// Boards ESP32-HUB75-MatrixPanel-DMA actually supports (its 'LCD mode' DMA
// peripheral) — the classic ESP32 and its S2/S3 successors, not the RISC-V
// C3/C6/H2 variants (or any other board family). Plain base FQBNs: the
// upload UI passes `selectedFqbn` without a `:PSRAM=…` suffix here (that's
// only appended at the actual build/compile call site).
// More than one catalogue entry maps to the classic ESP32 (the original Xtensa
// dual-core part): the generic `esp32` board and the 30-pin DOIT DevKit v1
// (ESP-32D / WROOM-32D). Capabilities that exist only on that silicon — the
// built-in DAC, HUB75's LCD-mode DMA — must accept every one of them, so gate
// on this set rather than comparing against a single FQBN string.
const CLASSIC_ESP32_FQBNS: ReadonlySet<string> = new Set([
  'esp32:esp32:esp32',
  'esp32:esp32:esp32doit-devkit-v1',
])

export function isClassicEsp32(fqbn: string): boolean {
  return CLASSIC_ESP32_FQBNS.has(fqbn)
}

const HUB75_SUPPORTED_FQBNS = new Set([...CLASSIC_ESP32_FQBNS, 'esp32:esp32:esp32s2', 'esp32:esp32:esp32s3'])

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

/** A used Audio capability must resolve to one concrete hardware source. */
export function findAudioCapabilityErrors(
  nodes: StudioNode[],
  edges: StudioEdge[],
  capabilityNodes: readonly StudioNode[] = nodes,
): string[] {
  return nodes
    .filter((node) =>
      node.data.nodeType === 'Audio' &&
      edges.some((edge) => edge.source === node.id) &&
      !resolveAudioCapabilitySource(capabilityNodes, String(node.data.properties.sourceId ?? ''))
    )
    .map((node) => `${nodeLabel(node)} has no attached source — add a microphone, line-in ADC, or SD music player, or choose an available source`)
}

/** A used Storage capability must resolve to one concrete provider. */
export function findStorageCapabilityErrors(
  nodes: StudioNode[],
  edges: StudioEdge[],
  capabilityNodes: readonly StudioNode[] = nodes,
): string[] {
  return nodes
    .filter((node) =>
      node.data.nodeType === 'Storage' &&
      edges.some((edge) => edge.source === node.id) &&
      !resolveStorageCapabilitySource(capabilityNodes, String(node.data.properties.sourceId ?? ''))
    )
    .map((node) => `${nodeLabel(node)} has no attached storage provider — add a board or SD card, or choose an available provider`)
}

function findRtcWarnings(nodes: StudioNode[]): string[] {
  return nodes.flatMap((node) => {
    if (node.data.nodeType !== 'RTCInput') return []
    const props = node.data.properties as Record<string, unknown>
    const source = String(props.timeSource ?? 'Compile Time')
    if (source === 'Manual') {
      const valid = isValidRtcDateTime({
        year: Number(props.startYear ?? 0),
        month: Number(props.startMonth ?? 0),
        day: Number(props.startDay ?? 0),
        hour: Number(props.startHour ?? 0),
        minute: Number(props.startMinute ?? 0),
        second: Number(props.startSecond ?? 0),
      })
      return valid ? [] : [`${String(node.data.label ?? node.data.nodeType)} has an invalid manual RTC start date/time`]
    }
    if (source === 'NTP') {
      if (!String(props.ntpServer ?? '').trim()) return [`${String(node.data.label ?? node.data.nodeType)} is missing its NTP server`]
      if (!getNetworkCredentials(node.id).ssid.trim()) return [`${String(node.data.label ?? node.data.nodeType)} is missing its Wi-Fi SSID for NTP sync`]
    }
    return []
  })
}

function isIpv4(value: unknown): boolean {
  const text = String(value ?? '').trim()
  if (!text) return false
  const parts = text.split('.')
  if (parts.length !== 4) return false
  return parts.every((part) => {
    if (!/^\d+$/.test(part)) return false
    const n = Number(part)
    return n >= 0 && n <= 255
  })
}

function findNetworkConfigWarnings(nodes: StudioNode[]): string[] {
  const warnings: string[] = []
  const networkUsers = nodes.filter((node) => {
    const props = node.data.properties as Record<string, unknown>
    return (node.data.nodeType === 'DMXInput' && String(props.inputMode ?? 'Art-Net') === 'Art-Net')
      || (node.data.nodeType === 'RTCInput' && String(props.timeSource ?? 'Compile Time') === 'NTP')
  })
  if (networkUsers.length === 0) return warnings

  const signatures = new Set(networkUsers.map((node) => {
    const props = node.data.properties as Record<string, unknown>
    const credentials = getNetworkCredentials(node.id)
    return JSON.stringify({
      wifiSsid: credentials.ssid.trim(),
      wifiPassword: credentials.password,
      wifiHostname: String(props.wifiHostname ?? '').trim(),
      useDhcp: props.useDhcp !== false,
      staticIp: String(props.staticIp ?? '').trim(),
      staticGateway: String(props.staticGateway ?? '').trim(),
      staticSubnet: String(props.staticSubnet ?? '').trim(),
      staticDns: String(props.staticDns ?? '').trim(),
    })
  }))
  if (signatures.size > 1) {
    warnings.push('Network-enabled DMX / RTC nodes disagree on Wi-Fi settings — generated firmware shares one Wi-Fi connection')
  }

  for (const node of networkUsers) {
    const props = node.data.properties as Record<string, unknown>
    const label = String(node.data.label ?? node.data.nodeType)
    if (!getNetworkCredentials(node.id).ssid.trim()) warnings.push(`${label} is missing its Wi-Fi SSID`)
    if (props.useDhcp === false) {
      if (!isIpv4(props.staticIp)) warnings.push(`${label} has an invalid static IP address`)
      if (!isIpv4(props.staticGateway)) warnings.push(`${label} has an invalid gateway address`)
      if (!isIpv4(props.staticSubnet)) warnings.push(`${label} has an invalid subnet mask`)
      const dns = String(props.staticDns ?? '').trim()
      if (dns && !isIpv4(dns)) warnings.push(`${label} has an invalid DNS address`)
    }
  }
  return warnings
}

/** Schedule problems, each attributed to the node that owns it so the Graph
 *  Health drawer can select and fit it like every other node diagnostic. */
function findScheduleIssues(
  nodes: StudioNode[],
  edges: StudioEdge[],
): { nodeId: string; message: string; fix: string }[] {
  const incoming = new Set(edges.filter((edge) => edge.target && edge.targetHandle).map((edge) => `${edge.target}:${edge.targetHandle}`))
  const issues: { nodeId: string; message: string; fix: string }[] = []
  for (const node of nodes) {
    if (node.data.nodeType !== 'ScheduleTrigger') continue
    const label = String(node.data.label ?? node.data.nodeType)
    if (!incoming.has(`${node.id}:secondsOfDay`) || !incoming.has(`${node.id}:valid`)) {
      issues.push({
        nodeId: node.id,
        message: `${label} should be wired to an RTC Clock valid + seconds-of-day feed`,
        fix: 'Wire an RTC Clock node’s Valid and Seconds Today outputs into this schedule.',
      })
    }
    const props = node.data.properties as Record<string, unknown>
    if (String(props.scheduleMode ?? 'Window') === 'Window') {
      const start = Number(props.startHour ?? 0) * 3600 + Number(props.startMinute ?? 0) * 60 + Number(props.startSecond ?? 0)
      const end = Number(props.endHour ?? 0) * 3600 + Number(props.endMinute ?? 0) * 60 + Number(props.endSecond ?? 0)
      if (!Number.isFinite(start) || !Number.isFinite(end)) {
        issues.push({
          nodeId: node.id,
          message: `${label} has an invalid schedule time`,
          fix: 'Set the start and end hour/minute/second to real numbers.',
        })
      } else if (start === end) {
        // `active` uses an inclusive compare, so an equal start/end is on for a
        // single instant — almost always a half-finished window, not intent.
        issues.push({
          nodeId: node.id,
          message: `${label} starts and ends at the same time, so it is only ever active for that one instant`,
          fix: 'Move the end time later than the start, or switch the node to Trigger mode for a one-shot pulse.',
        })
      }
    }
  }
  return issues
}

export interface PowerEstimate {
  ledCount: number
  /** Worst-case draw if every LED shows full-white at once, in mA. */
  worstCaseMa: number
  /** `volts`/`milliamps` × configured cap, or null when `powerLimit` is off. */
  configuredMa: number | null
  /** Worst-case draw rounded up to a sane PSU-shopping figure. */
  recommendedMa: number
  /** True once a configured cap exists and falls short of a sane safety margin
   *  below worst case (see `POWER_CAP_MIN_COVERAGE`) — not simply "any cap
   *  below the theoretical full-white max", since FastLED's power capping is
   *  designed to auto-dim in that everyday case and a cap can never clear a
   *  100%-of-worst-case bar without being pointless. */
  exceedsConfigured: boolean
}

// Typical full-white draw for a WS2812-class LED at 5V (the number FastLED's
// own examples and most guides use). Real draw varies by chipset/voltage, but
// this is the right order of magnitude for a "will my PSU cope" estimate —
// exact chipset current draw isn't published widely enough to model per-part.
const MA_PER_LED_WORST_CASE = 60

// HUB75 panels draw far less per pixel than an addressable-strip LED (their
// sub-pixels are smaller and current-limited by the panel's own driver ICs),
// so reusing MA_PER_LED_WORST_CASE above would wildly overstate a HUB75
// route's draw. Derived from real hardware, not a spec sheet: reported
// current draw on a P4 64×64 (4096-pixel) indoor panel ranges roughly
// 1.0–2.5 A typical, up to ~4 A at the high end. Anchored to that high end
// (4 A / 4096 px ≈ 1 mA/px) to keep the same "worst case" framing as the
// addressable figure above. This is one measured data point for one panel
// model — real draw varies by resolution/driver IC, so treat it as a rough
// guide, same as the addressable-strip figure.
const MA_PER_HUB75_PIXEL_WORST_CASE = 1

// A configured power cap almost never needs to cover a full-white-everywhere
// moment — that's the scenario FastLED's power capping exists to auto-dim
// gracefully, and real patterns rarely hit it. A cap at or above this fraction
// of the theoretical worst case is treated as a deliberate, adequate safety
// margin rather than a misconfiguration to keep flagging.
const POWER_CAP_MIN_COVERAGE = 2 / 3

/** Nodes that drive physical LEDs, in every form. */
export function ledDrivingOutputs(nodes: StudioNode[]): StudioNode[] {
  return nodes.filter((node) => node.data.nodeType === 'MatrixOutput')
}

/** LEDs on one output: a panel's grid, or a chain's length. Every estimate that
 *  costs LEDs — power draw, firmware RAM — counts through here, so a string or
 *  a ring can never be silently priced at zero the way it was while only a
 *  width x height grid was understood. */
export function outputLedCount(node: StudioNode): number {
  return outputLedTotal(node.data.properties as Record<string, unknown>)
}

export function estimatePowerLoad(nodes: StudioNode[]): PowerEstimate | null {
  const outputs = ledDrivingOutputs(nodes)
  if (outputs.length === 0) return null
  const ledCount = outputs.reduce((sum, output) => sum + outputLedCount(output), 0)
  const worstCaseMa = outputs.reduce((sum, output) => {
    const props = output.data.properties as Record<string, unknown>
    const rate = outputForm(props) === 'hub75' ? MA_PER_HUB75_PIXEL_WORST_CASE : MA_PER_LED_WORST_CASE
    return sum + (outputLedCount(output) * rate)
  }, 0)
  const controller = controllerSettings(nodes)
  const configuredMa = controller.powerLimit ? controller.milliamps : null
  const recommendedMa = Math.ceil(worstCaseMa / 100) * 100
  return {
    ledCount,
    worstCaseMa,
    configuredMa,
    recommendedMa,
    exceedsConfigured: configuredMa != null && configuredMa < worstCaseMa * POWER_CAP_MIN_COVERAGE,
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
  /** `CRGBPalette16` globals the sketch declares — the shared `paldef_<name>`
   *  tables plus one `pal_<id>` per palette-building node. 48 bytes each, and
   *  always internal: codegen never PSRAM-allocates them. */
  paletteBytes: number
  /** Whether the Board's `usePsram` is on (frame/field buffers move to PSRAM). */
  usesPsram: boolean
  /** RAM that must fit in the MCU's internal SRAM regardless of PSRAM. */
  internalBytes: number
  /** RAM offloaded to external PSRAM (0 when `usePsram` is off). */
  psramBytes: number
}

const OUTPUT_DATATYPES_BY_NODE_TYPE = new Map(
  NODE_LIBRARY.map((def) => [def.type, new Set(def.outputs.map((o) => o.dataType))])
)

/** Input ports that consume a `palette`, so a node's palette references can be resolved. */
const PALETTE_INPUT_PORTS_BY_NODE_TYPE = new Map(
  NODE_LIBRARY.map((def) => [def.type, def.inputs.filter((i) => i.dataType === 'palette').map((i) => i.id)])
)

/** `sizeof(CRGBPalette16)` — 16 CRGB entries. */
const PALETTE_BYTES = 48

// Node types whose emit case builds its own `pal_<id>` table rather than
// referencing a shared `paldef_<name>` one. Mirrors the branch in
// cppGenerator's `paletteExpr`.
const PALETTE_BUILDER_TYPES = new Set(['CustomPalette', 'PaletteFromImage', 'PaletteBlend', 'Poline'])

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
  const outputs = ledDrivingOutputs(nodes)
  if (outputs.length === 0) return null
  const { w, h } = compositionDims(nodes, edges)
  // Runs wired in parallel off one pin share a single `leds` array, so RAM
  // counts them once — unlike power, which counts every physical run because
  // each one is a real panel on the PSU.
  const controllers = new Set(leadingOutputRoutes(nodes, edges).map((route) => route.id))
  const ledCount = outputs
    .filter((output) => controllers.has(output.id))
    .reduce((sum, output) => sum + outputLedCount(output), 0)
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

  // The node feeding a single plain output renders into `leds` rather than
  // owning a buffer that is copied over (cppGenerator's terminal alias), so it
  // is not counted. The conditions are restated here rather than shared,
  // because codegen's own check runs against expression-resolved properties it
  // derives internally; when the two disagree this over-counts by one frame,
  // which is the safe direction for a budget. The compile-check meter remains
  // the authority on actual usage.
  const aliasedTerminalId = (() => {
    if (outputs.length !== 1) return null
    const output = outputs[0]
    const p = output.data.properties as Record<string, unknown>
    if (outputForm(p) === 'ring' || outputForm(p) === 'corkscrew' || p.supersample === true) return null
    if (String(p.chipset ?? '') === 'HUB75') return null
    if (buildXYTable(w, h, p)) return null
    const feed = (incomingByTarget.get(output.id) ?? []).find((e) => e.targetHandle === 'frame')
    if (!feed || feed.sourceHandle !== 'frame') return null
    const consumers = edges.filter((e) => e.source === feed.source && e.sourceHandle === 'frame')
    return consumers.length === 1 ? feed.source : null
  })()

  let frameBufferBytes = 0, fieldBufferBytes = 0, statefulBytes = 0
  for (const id of reachable) {
    const n = byId.get(id)
    if (!n) continue
    const outputTypes = OUTPUT_DATATYPES_BY_NODE_TYPE.get(n.data.nodeType)
    if (outputTypes?.has('frame') && id !== aliasedTerminalId) frameBufferBytes += renderLedCount * 3
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

  // Palette globals. Codegen declares one shared `paldef_<name>` per distinct
  // named palette a sketch references, plus one `pal_<id>` per palette-building
  // node — resolved the same way cppGenerator's `paletteExpr` does, reading the
  // palette-typed input ports from NODE_LIBRARY rather than restating which
  // nodes consume one. Errs toward over-counting if an emit case declares a
  // palette port it never samples, which is the safe direction for a budget.
  const incomingByHandle = new Map<string, StudioEdge>()
  for (const e of edges) {
    if (e.target && e.targetHandle) incomingByHandle.set(`${e.target}:${e.targetHandle}`, e)
  }
  const namedPalettes = new Set<string>()
  let builderPalettes = 0
  for (const id of reachable) {
    const n = byId.get(id)
    if (!n) continue
    if (PALETTE_BUILDER_TYPES.has(n.data.nodeType)) builderPalettes++
    for (const port of PALETTE_INPUT_PORTS_BY_NODE_TYPE.get(n.data.nodeType) ?? []) {
      const wired = incomingByHandle.get(`${id}:${port}`)
      const src = wired ? byId.get(wired.source) : undefined
      // A builder upstream resolves to its own `pal_<id>`, already counted above.
      if (src && PALETTE_BUILDER_TYPES.has(src.data.nodeType)) continue
      const props = ((src ?? n).data.properties ?? {}) as Record<string, unknown>
      namedPalettes.add(String(props.palette ?? 'rainbow').toLowerCase())
    }
  }
  const paletteBytes = (namedPalettes.size + builderPalettes) * PALETTE_BYTES

  const ledsArrayBytes = ledCount * 3
  const usesPsram = controllerSettings(nodes).usePsram
  const psramBytes = usesPsram ? frameBufferBytes + fieldBufferBytes : 0
  const internalBytes = ledsArrayBytes + statefulBytes + paletteBytes + (usesPsram ? 0 : frameBufferBytes + fieldBufferBytes)

  return { ledCount, ledsArrayBytes, frameBufferBytes, fieldBufferBytes, statefulBytes, paletteBytes, usesPsram, internalBytes, psramBytes }
}

// A conservative "worth a heads-up" threshold for classic ESP32-class internal
// SRAM (WiFi/BT stacks and the rest of the app already claim a large share of
// the ~300–500 KB total) — not a hard board-specific limit.
const INTERNAL_RAM_WARN_BYTES = 40_000

/**
 * Pin uses that are a shared GPIO on purpose, as `nodeId:propertyKey` keys.
 *
 * LED outputs wired in parallel share a data pin deliberately — that is what
 * makes them one controller driving two panels — so the mirror's data pin is
 * dropped and the GPIO reads as the single assignment it is. Every other pin on
 * those nodes still collides normally.
 *
 * Shared by both pin-collision walks (`findPinConflicts` for deploy validation,
 * `buildGraphDiagnostics` for the Graph Health drawer). They are separate
 * loops over the same data and have already drifted once: exempting only the
 * first left the drawer still calling a deliberately shared pin an error.
 */
export function deliberatelySharedPinUses(nodes: StudioNode[], edges: StudioEdge[]): Set<string> {
  const routes = outputRoutes(nodes)
  const leaders = outputMirrorLeaders(routes, edges)
  return new Set(
    routes.filter((route) => leaders.get(route.id) !== route.id).map((route) => `${route.id}:dataPin`),
  )
}

/**
 * I2C devices in the graph, paired with the pin uses that place them on a bus.
 *
 * Address collisions need the node as well as its pins, so this is assembled
 * once and handed to the shared checker rather than re-derived by each walk.
 */
function i2cDevices(nodes: StudioNode[]) {
  const uses = collectPinUses(nodes)
  return nodes
    .map((node) => ({
      nodeId: node.id,
      nodeType: node.data.nodeType,
      props: node.data.properties as Record<string, unknown>,
      uses: uses.filter((use) =>
        use.nodeId === node.id && busAssignmentFor(use.nodeType, use.propertyKey).kind === 'i2c'),
    }))
    .filter((device) => device.uses.length > 0)
}

/**
 * Pin faults for deploy validation.
 *
 * Bus-aware since displays made sharing normal: two I2C clients may share SDA
 * and SCL, and two SPI clients may share SCK/MOSI/MISO, so the old "any GPIO
 * claimed twice" rule would have reported correct wiring as broken. What each
 * pin *is* lives in state/busTopology.ts; this function only formats the
 * verdict.
 */
export function findPinConflicts(nodes: StudioNode[], edges: StudioEdge[] = []): string[] {
  const shared = deliberatelySharedPinUses(nodes, edges)
  const uses = collectPinUses(nodes)
  const conflicts = findPinCollisions(uses, shared).map(pinCollisionMessage)
  const addresses = findI2cAddressCollisions(i2cDevices(nodes)).map(addressCollisionMessage)
  return [...conflicts, ...addresses].sort()
}

/**
 * Parallel runs share one array, so the leader's length is the one that reaches
 * the wire and a shorter run lights only the first part of it.
 *
 * A **warning**, not an error, because uneven parallel runs are a real build:
 * eight strips forming a star with four of them half length is exactly this
 * shape, and taking a prefix is what the designer wants there. Worth saying out
 * loud — it is also what an accidental size typo looks like — but never worth
 * blocking an upload over, so the copy describes the behaviour rather than
 * demanding a fix.
 */
export function findMirroredOutputMismatches(nodes: StudioNode[], edges: StudioEdge[]): string[] {
  const routes = outputRoutes(nodes)
  const leaders = outputMirrorLeaders(routes, edges)
  const byId = new Map(routes.map((route) => [route.id, route]))
  const issues: string[] = []
  for (const route of routes) {
    const leaderId = leaders.get(route.id)
    if (!leaderId || leaderId === route.id) continue
    const leader = byId.get(leaderId)
    if (!leader) continue
    const mine = outputLedTotal(route.node.data.properties as Record<string, unknown>)
    const theirs = outputLedTotal(leader.node.data.properties as Record<string, unknown>)
    if (mine !== theirs) {
      const shorter = mine < theirs ? route.label : leader.label
      issues.push(`${route.label} (${mine} LEDs) and ${leader.label} (${theirs} LEDs) are wired in parallel on GPIO ${route.dataPin}, so both carry the same data and ${shorter} lights only the first ${Math.min(mine, theirs)} pixels of it. Intended for uneven runs; match their lengths or split the pin if it is not.`)
    }
  }
  return issues.sort()
}

export function isValidPinNumber(pin: number): boolean {
  return Number.isInteger(pin) && pin >= 0 && pin <= MAX_PIN_NUMBER
}

export function findPinRangeWarnings(nodes: StudioNode[]): string[] {
  const warnings = collectPinUses(nodes)
    .filter((use) => !isValidPinNumber(use.pin))
    .map((use) => `${use.label} is set to ${use.pin}, which isn't a valid Arduino pin number (expected a whole number from 0–${MAX_PIN_NUMBER})`)
  return warnings.sort()
}

export interface BoardPinCompatibility {
  errors: string[]
  warnings: string[]
}

/** The exact board a Board node names, if the graph has one and it resolves. */
export function selectedBoardProfile(nodes: StudioNode[]): PhysicalBoardProfile | undefined {
  const board = nodes.find((node) => node.data.nodeType === 'Board')
  const id = (board?.data.properties as Record<string, unknown> | undefined)?.profileId
  return typeof id === 'string' && id ? boardProfileById(id) : undefined
}

/**
 * Pin checks the FQBN cannot make.
 *
 * `findBoardPinCompatibility` above validates against the *chip*, which is why
 * a Seeed XIAO and an ESP32-S3-DevKitC-1 look identical to it — both are
 * `esp32:esp32:esp32s3`. The XIAO reaches GPIO39-42 only through underside
 * pads, so a microphone on GPIO39 passes every chip-level rule and still
 * cannot be wired. The Board node's profile is the only thing that knows.
 *
 * Silent when no Board node is present, when its profile carries no safety
 * data, or when a pin's standing is `unknown` — an allowlist is not exhaustive,
 * so absence is not evidence against a pin.
 */
export function findExactBoardPinIssues(nodes: StudioNode[]): BoardPinCompatibility {
  const profile = selectedBoardProfile(nodes)
  const errors: string[] = []
  const warnings: string[] = []
  if (!profile?.pinSafety) return { errors, warnings }
  for (const use of collectPinUses(nodes)) {
    if (!isValidPinNumber(use.pin)) continue
    const verdict = boardPinVerdict(profile, use.pin)
    if (verdict.standing === 'reserved') {
      errors.push(`${use.label} uses pin ${use.pin}, which isn't available on a ${profile.label}: ${verdict.reason}`)
    } else if (verdict.standing === 'caution') {
      warnings.push(`${use.label} uses pin ${use.pin} on a ${profile.label}: ${verdict.reason}`)
    }
  }
  return { errors, warnings }
}

/** Checks every generated pin role against the selected board's Arduino pin
 * table. Custom boards without a table keep the numeric-only fallback. */
export function findBoardPinCompatibility(nodes: StudioNode[], selectedFqbn: string): BoardPinCompatibility {
  const gpio = selectedFqbn ? boardGpioInfo(selectedFqbn) : undefined
  if (!gpio) return { errors: [], warnings: [] }
  const errors: string[] = []
  const warnings: string[] = []
  for (const use of collectPinUses(nodes)) {
    if (!isValidPinNumber(use.pin) || !use.requirement) continue
    const unavailable = gpio.caution.find((pin) => pin.pin === use.pin)
    if (unavailable) {
      errors.push(`${use.label} uses pin ${use.pin}, which is unavailable on the selected board: ${unavailable.note}`)
      continue
    }
    const pin = gpio.recommended.find((candidate) => candidate.pin === use.pin)
    if (!pin) {
      errors.push(`${use.label} uses pin ${use.pin}, which isn't listed as a usable pin on the selected board`)
      continue
    }
    if (!pinSupports(pin, use.requirement.capability)) {
      const capability = use.requirement.capability === 'analogInput'
        ? 'analog input'
        : use.requirement.capability === 'digitalInput'
          ? 'digital input'
          : 'digital output'
      errors.push(`${use.label} uses pin ${use.pin}, which doesn't support ${capability} on the selected board`)
      continue
    }
    if (use.requirement.pullup && !pinSupports(pin, 'pullup')) {
      errors.push(`${use.label} uses pin ${use.pin}, which has no internal pull-up on the selected board`)
      continue
    }
    if (pin.warning) warnings.push(`${use.label} uses pin ${use.pin}: ${pin.warning}`)
  }
  return { errors: errors.sort(), warnings: warnings.sort() }
}

export function findMatrixLayoutErrors(nodes: StudioNode[]): string[] {
  return nodes.filter((node) => node.data.nodeType === 'MatrixOutput').flatMap((output, index) => {
    const props = output.data.properties as Record<string, unknown>
    // Strings, rings, and corkscrews have dedicated chain/shape geometry. A
    // stale matrix layout in a migrated node is not part of their output path.
    if (isLinearForm(outputForm(props))) return []
    const width = Math.max(0, Math.round(Number(props.width ?? 0)))
    const height = Math.max(0, Math.round(Number(props.height ?? 0)))
    const base = String(output.data.label ?? output.data.nodeType)
    const label = nodes.filter((node) => node.data.nodeType === 'MatrixOutput').length > 1 ? `${base} ${index + 1}` : base
    return validateMatrixLayout(width, height, props).map((message) => `${label}: ${message}`)
  })
}

/**
 * A shape-mapped chain driven by the Show Engine or music-sync SD player,
 * whose specialized sketches cannot render it yet.
 *
 * Rings and corkscrews are chains that read through dedicated sample maps, so
 * they need a map table plus a physical LED array kept
 * separate from the render buffer — `generateCpp` does both. The show/player
 * generators have neither: `leds` is the composition buffer every pattern
 * renders into and every transition composites through, and their blits have
 * no shape-map branch.
 * So a mapped chain in a show drove its authoring raster down the physical run,
 * lighting the wrong LED from the wrong pixel.
 *
 * Blocked rather than emitted, on the same principle as the HUB75 gate above:
 * a config no generator can express is an error at deploy, not a surprise on
 * the bench. Removing this means teaching the show sketch the same
 * composition/physical split `generateCpp` already makes.
 */
export function findShowOutputFormErrors(nodes: StudioNode[], edges: StudioEdge[]): string[] {
  const masters = new Set(nodes.filter((node) => node.data.nodeType === 'PatternMaster').map((node) => node.id))
  const showDriven = new Set(edges
    .filter((edge) => masters.has(edge.source) && edge.sourceHandle === 'frame' && edge.targetHandle === 'frame')
    .map((edge) => edge.target))
  const playerDriven = new Set(edges
    .filter((edge) => edge.targetHandle === 'sdcard')
    .map((edge) => edge.target))
  return nodes
    .filter((node) => node.data.nodeType === 'MatrixOutput' && (showDriven.has(node.id) || playerDriven.has(node.id)))
    .filter((node) => {
      const form = outputForm(node.data.properties as Record<string, unknown>)
      return form === 'ring' || form === 'corkscrew'
    })
    .map((node) => {
      const form = outputForm(node.data.properties as Record<string, unknown>)
      const label = form === 'ring' ? 'ring' : 'corkscrew'
      const geometry = form === 'ring' ? 'circular' : 'helical'
      const workflow = showDriven.has(node.id) ? 'Music Player' : 'music-sync SD player'
      return `${String(node.data.label ?? (form === 'ring' ? 'LED Ring' : 'LED Corkscrew'))}: a ${label} cannot be driven by the ${workflow} yet — its ${geometry} LED map is not generated for that firmware. Use a string or matrix output, or drive the ${label} from a normal pattern graph.`
    })
}

/**
 * What a music-sync show needs on the bench before it can be built.
 *
 * The player is a whole firmware for a whole board: it reads the card, decodes
 * the song, turns it into sound, and drives the LEDs. Every one of those is a
 * physical thing, and every one of them has to be named — until this existed
 * the generator filled the gaps by scanning and defaulting, so the LED output
 * was whichever MatrixOutput came first in the node array (or a hardcoded 16x16
 * WS2812B on GPIO18 when there was none), and the audio path was inferred from
 * whatever the board could theoretically do. A board flashed from those
 * assumptions lights nothing, plays nothing, and explains neither.
 *
 * The bench is also how the player will learn to talk to parts it does not know
 * about yet: an audio module is a declared part with a model, so a new one is a
 * new entry in the catalogue rather than a new guess here.
 *
 * Reported per missing piece rather than as one "show is incomplete", because
 * each one is a different thing to go and do.
 */
export function findShowRequirementErrors(
  nodes: StudioNode[], edges: StudioEdge[], selectedFqbn = '',
): string[] {
  const generator = nodes.find((node) => node.data.nodeType === 'PerformanceGenerator')
  if (!generator) return []
  const errors: string[] = []

  const { reached, problem } = resolveShowTarget(nodes, edges)
  if (problem === 'unconnected') {
    errors.push('Performance Generator is not sending its show anywhere — wire its Show output into an LED output, so the player knows which hardware to drive')
  } else if (problem === 'ambiguous') {
    errors.push(`Performance Generator drives ${reached.length} LED outputs — the SD player runs one. Disconnect all but the output the show plays on.`)
  }

  // The card is the whole point: the player streams the song and the .show file
  // off it at runtime. Without one there is nothing to play and no player to
  // build, and the graph would fall through to an ordinary sketch — which has
  // no case for this node, so the LEDs would simply stay dark.
  if (!nodes.some((node) => node.data.nodeType === 'SDCard')) {
    errors.push('The music show has no SD Card — add one in the hardware view, since the player reads the song and the timed show file from the card at runtime')
  }

  // Nothing on the bench turns the decoded song into sound. The board's own
  // pins are not an answer: an I2S amplifier, an I2S DAC and an analog amp are
  // three different parts, wired three different ways, and the player has to
  // emit code for the one that is actually there. Inferring it from what the
  // board *could* do meant a graph with no audio module at all still generated
  // a confident I2S sketch (or a DAC one) for hardware nobody had described.
  const amplifier = nodes.find((node) => node.data.nodeType === 'Amplifier')
  if (!amplifier) {
    errors.push('The music show has nothing to play the song through — add an Amplifier in the hardware view (a MAX98357A drives a speaker directly; an I2S DAC or analog amp are the other shapes)')
  } else if (audioOutputMissing(nodes, selectedFqbn)) {
    errors.push('The SD show\'s audio module cannot make a sound on this board — an analog amplifier needs line level from an internal DAC, which only the classic ESP32 has')
  }

  return errors
}

export interface Hub75ConfigIssue {
  nodeId: string
  label: string
  message: string
}

// HUB75 is a deliberately single-route output family: if a board is driving a
// HUB75 panel, this project does not also support an addressable-strip output
// on that same board. Supersampling is still unsupported too. Layout is either
// 'matrix' (one panel) or 'panels' (a single-row or folded 2D chain). Per-
// panel rotation is now supported by a generated coordinate remap layered on
// top of the DMA library's own chain routing, with one remaining shape guard:
// 90°/270° quarter-turns only make sense when each panel tile is square,
// because the library's panel resolution is fixed per chain.
// Block every other combination rather than silently generating a broken
// sketch.
//
// All five sketch generators that share these hardware helpers now have real
// HUB75 support (generateCpp, generateWiringDiagnosticSketch,
// generateStreamReceiverSketch, generateShowSketch, and
// playerSketchGenerator), so this gate only needs to cover config shapes
// none of them can emit yet (mixed-output HUB75, unsupported layout, non-
// square quarter-turns, supersample) — not which generator a given graph would
// reach.
export function findHub75ConfigIssues(nodes: StudioNode[]): Hub75ConfigIssue[] {
  const issues: Hub75ConfigIssue[] = []
  const matrixOutputs = nodes.filter((node) => node.data.nodeType === 'MatrixOutput')
  const singleOutput = matrixOutputs.length === 1
  matrixOutputs.forEach((output, index) => {
    const props = output.data.properties as Record<string, unknown>
    if (outputForm(props) !== 'hub75') return
    const base = String(output.data.label ?? output.data.nodeType)
    const label = matrixOutputs.length > 1 ? `${base} ${index + 1}` : base
    if (!singleOutput) {
      issues.push({
        nodeId: output.id, label,
        message: `${label} is set to HUB75, which only supports a single LED output route by design — remove the other output route(s), or switch this one to an addressable chipset.`,
      })
      return
    }
    const layout = String(props.layout ?? 'matrix')
    if (layout === 'panels') {
      const tilesY = Math.max(1, Math.round(Number(props.tilesY ?? 1)))
      const tilesX = Math.max(1, Math.round(Number(props.tilesX ?? 1)))
      const width = Math.max(0, Math.round(Number(props.width ?? 0)))
      const height = Math.max(0, Math.round(Number(props.height ?? 0)))
      const tileW = width % tilesX === 0 ? width / tilesX : 0
      const tileH = height % tilesY === 0 ? height / tilesY : 0
      const quarterTurn = Array.from({ length: tilesX * tilesY }, (_, i) => tileRotationAt(props, i)).some((r) => r === 90 || r === 270)
      if (quarterTurn && tileW > 0 && tileH > 0 && tileW !== tileH) {
        issues.push({
          nodeId: output.id, label,
          message: `${label} is set to HUB75, which only supports 90°/270° per-panel rotation when each panel tile is square — use square panel tiles, change those panels to 0°/180°, or use an addressable chipset.`,
        })
        return
      }
    } else if (layout !== 'matrix') {
      issues.push({
        nodeId: output.id, label,
        message: `${label} is set to HUB75, which only supports the Matrix layout or a Panels chain so far — switch layout to Matrix or Panels, or use an addressable chipset.`,
      })
      return
    }
    if (props.supersample === true) {
      issues.push({
        nodeId: output.id, label,
        message: `${label} is set to HUB75, which doesn't support supersampling yet — turn off Supersample, or use an addressable chipset.`,
      })
    }
  })
  return issues
}

export function findHub75ConfigErrors(nodes: StudioNode[]): string[] {
  return findHub75ConfigIssues(nodes).map((issue) => issue.message)
}

/** Validate the narrower shape required by the dedicated HUB75 2D topology
 *  wiring test. Normal HUB75 output also supports one panel and one horizontal
 *  row; the topology pattern is intentionally limited to folded grids because
 *  its job is to expose row folds, panel-chain serpentine order, and per-tile
 *  mounting rotation. Kept separate from build validation so a perfectly
 *  valid single-panel project is never diagnosed as unhealthy merely because
 *  this optional hardware test does not apply to it. */
export function findHub75TopologyDiagnosticErrors(nodes: StudioNode[], outputNodeId?: string): string[] {
  const output = nodes.find((node) => node.id === outputNodeId && node.data.nodeType === 'MatrixOutput')
    ?? nodes.find((node) => node.data.nodeType === 'MatrixOutput')
  if (!output) return ['Add an LED output before flashing the HUB75 2D topology test.']

  const props = output.data.properties as Record<string, unknown>
  if (outputForm(props) !== 'hub75') {
    return ['Set the LED output form to HUB75 Panel to use the 2D panel-topology test.']
  }

  const configIssue = findHub75ConfigIssues(nodes).find((issue) => issue.nodeId === output.id)
  if (configIssue) return [configIssue.message]
  if (String(props.layout ?? 'matrix') !== 'panels') {
    return ['Set the LED output layout to Panels to use the HUB75 2D panel-topology test.']
  }

  const width = Math.max(0, Math.round(Number(props.width ?? 0)))
  const height = Math.max(0, Math.round(Number(props.height ?? 0)))
  const layoutErrors = validateMatrixLayout(width, height, props)
  if (layoutErrors.length > 0) return layoutErrors.map((message) => `${String(output.data.label ?? 'LED output')}: ${message}`)

  const tilesY = Math.max(1, Math.round(Number(props.tilesY ?? 1)))
  if (tilesY < 2) {
    return ['Set Panels Y to at least 2; the dedicated topology test is for folded 2D HUB75 grids.']
  }
  return []
}

export function findBoardCompatibilityErrors(nodes: StudioNode[], selectedFqbn: string): string[] {
  const errors: string[] = []
  if (selectedFqbn && nodes.some((node) => node.data.nodeType === 'MicInput') && !inmp441SupportedForBoard(selectedFqbn)) {
    errors.push(INMP441_UNSUPPORTED_MESSAGE)
  }
  if (selectedFqbn && nodes.some((node) => node.data.nodeType === 'LineInput') && !selectedFqbn.startsWith('esp32:esp32:esp32s3')) {
    errors.push('PCM1802 line-in firmware currently requires an ESP32-S3 board so Studio can generate its synchronized MCLK/BCLK/LRCLK receive path')
  }
  if (selectedFqbn && nodes.some((node) =>
    node.data.nodeType === 'DMXInput' && String((node.data.properties as Record<string, unknown>).inputMode ?? 'Art-Net') === 'DMX512'
  ) && !selectedFqbn.startsWith('esp32:')) {
    errors.push('DMX512 firmware input requires an ESP32-family board because the generated sketch uses esp_dmx')
  }
  if (selectedFqbn && nodes.some((node) => {
    const props = node.data.properties as Record<string, unknown>
    return (node.data.nodeType === 'DMXInput' && String(props.inputMode ?? 'Art-Net') === 'Art-Net')
      || (node.data.nodeType === 'RTCInput' && String(props.timeSource ?? 'Compile Time') === 'NTP')
  }) && !selectedFqbn.startsWith('esp32:') && !selectedFqbn.startsWith('esp8266:')) {
    errors.push('Art-Net and NTP time sync require a Wi-Fi-capable ESP32-family board or ESP8266')
  }
  /*
   * "Internal DAC on a board with no DAC" used to be an error here. It cannot
   * happen any more: the output mode is derived from the parts present, and
   * `internalDac` is only ever chosen on a board that has one. The check went
   * with the property — a rule the model cannot express needs no validation.
   *
   * "A card full of music and nothing to play it through" moved too, to
   * `findShowRequirementErrors`, which now asks for the audio module outright
   * rather than only when the board has no DAC to fall back on. Both live there
   * so a show reports its missing parts in one place, and so the two rules
   * cannot both fire for one bench.
   */
  // ESP32-HUB75-MatrixPanel-DMA needs the ESP32/S2/S3 'LCD mode' DMA
  // peripheral; RISC-V ESP32 variants (C3/C6/H2) have no such hardware, per
  // the library's own supported-variants list — confirmed against its README
  // at the vendored tag, not guessed. Every other board family (AVR, RP2040,
  // SAMD, STM32, Teensy, ESP8266, …) is out entirely too.
  if (selectedFqbn && nodes.some((node) =>
    node.data.nodeType === 'MatrixOutput' && outputForm(node.data.properties as Record<string, unknown>) === 'hub75'
  ) && !HUB75_SUPPORTED_FQBNS.has(selectedFqbn)) {
    errors.push('HUB75 output requires a classic ESP32, ESP32-S2, or ESP32-S3 board — the DMA library needs their LCD-mode peripheral, which RISC-V ESP32 variants (C3/C6/H2) and other board families don\'t have')
  }
  errors.push(...findBoardPinCompatibility(nodes, selectedFqbn).errors)
  // Board-exact checks need no FQBN — the Board node names the board directly,
  // and it catches what the chip-level table above cannot.
  errors.push(...findExactBoardPinIssues(nodes).errors)
  return errors
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

/** Formula nodes whose source the sandboxed parser rejects. The preview
 *  already renders these blank, but an invalid formula must also block export
 *  and upload: the C++ generator refuses to emit unvalidated source (it falls
 *  back to a blank render), so without this the sketch would silently differ
 *  from what the node claims to do. */
export function findFormulaErrors(nodes: StudioNode[]): string[] {
  const errors: string[] = []
  for (const node of nodes) {
    if (node.data.nodeType !== 'CustomFormula' && node.data.nodeType !== 'FieldFormula') continue
    const formula = String((node.data.properties as Record<string, unknown>).formula ?? '')
    if (!isNodeFormulaValid(formula)) {
      errors.push(`${node.data.label} has an invalid formula: ${formula || '(empty)'}`)
    }
  }
  return errors
}

/** Kept as a validation seam for callers; power is now a single Board setting. */
export function findOutputResourceErrors(nodes: StudioNode[]): string[] {
  void nodes
  return []
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
  /** Root hardware catalogue used by Audio nodes inside a nested group. */
  capabilityNodes?: readonly StudioNode[]
}

const POWER_WARN_MA = 5_000

function nodeLabel(node: StudioNode): string {
  return String(node.data.label ?? node.data.nodeType)
}

interface PlayerControlMappingIssue {
  id: string
  domain: 'volume' | 'brightness'
  nodeIds: string[]
  nodeLabel: string
  message: string
}

/** Check conflicting mappings across a complete chained Player Controls domain. */
function playerControlMappingIssues(nodes: StudioNode[], edges: StudioEdge[]): PlayerControlMappingIssue[] {
  const controls = nodes.filter((node) => node.data.nodeType === 'PlayerControls')
  const byId = new Map(controls.map((node) => [node.id, node]))
  const neighbours = new Map(controls.map((node) => [node.id, new Set<string>()]))
  for (const edge of edges) {
    if (edge.targetHandle !== 'controlsIn' || !byId.has(edge.source) || !byId.has(edge.target)) continue
    neighbours.get(edge.source)?.add(edge.target)
    neighbours.get(edge.target)?.add(edge.source)
  }

  const issues: PlayerControlMappingIssue[] = []
  const visited = new Set<string>()
  for (const control of controls) {
    if (visited.has(control.id)) continue
    const component: string[] = []
    const pending = [control.id]
    visited.add(control.id)
    while (pending.length > 0) {
      const id = pending.pop()!
      component.push(id)
      for (const neighbour of neighbours.get(id) ?? []) {
        if (visited.has(neighbour)) continue
        visited.add(neighbour)
        pending.push(neighbour)
      }
    }

    const componentIds = new Set(component)
    const wiredHandles = new Set(edges
      .filter((edge) => componentIds.has(edge.target) && edge.targetHandle)
      .map((edge) => edge.targetHandle as string))
    for (const domain of ['volume', 'brightness'] as const) {
      const stepHandles = domain === 'volume' ? ['volumeUp', 'volumeDown'] : ['brightnessUp', 'brightnessDown']
      if (!wiredHandles.has(domain) || !stepHandles.some((handle) => wiredHandles.has(handle))) continue
      const first = byId.get(component[0])!
      issues.push({
        id: `player-controls-${component.slice().sort().join('-')}-${domain}`,
        domain,
        nodeIds: component,
        nodeLabel: nodeLabel(first),
        message: `${domain === 'volume' ? 'Volume' : 'Brightness'} has both an absolute control and up/down buttons in the same Player Controls chain`,
      })
    }
  }
  return issues
}

/**
 * Displays the selected build cannot actually drive.
 *
 * The rule this enforces is the display plan's blunt one: a generator either
 * emits a display and its bindings or it says why not. What it must never do is
 * build successfully and leave the part dark, because the first thing anyone
 * does then is doubt their wiring — and the wiring is fine.
 *
 * Two ways that happens. A generator with no display support at all will drop
 * the part outright. And the SD player, which does support displays, runs a
 * fixed template rather than a compiled graph, so it can read the Music Player
 * it is built around and nothing else; a display fed from a Wave has no value
 * to show there however reasonable the wire looks on the canvas.
 */
/** Auxiliary displays, for the checks that ask what a build can draw. */
const DISPLAY_NODE_TYPES = new Set(['InfoDisplay', 'SegmentDisplay'])

/**
 * I2C parts that cannot share the one bus the generated sketch starts.
 *
 * Two SDA/SCL pairs is legal wiring — an ESP32 has a second I2C host — but
 * every generator emits a single `Wire.begin`, so the devices on the other pair
 * simply never answer. That failure looks exactly like a bad solder joint from
 * the outside, which is why it is an error here rather than something to
 * discover with a multimeter.
 *
 * Reported only when a display is involved: an RTC is the sole other I2C part,
 * and one of it cannot disagree with itself.
 */
function splitI2cBusErrors(nodes: StudioNode[]): string[] {
  const devices = i2cDevices(nodes)
  if (!devices.some((device) => DISPLAY_NODE_TYPES.has(device.nodeType))) return []

  const buses = new Map<string, string[]>()
  for (const device of devices) {
    const role = (use: { nodeType: string; propertyKey: string }) =>
      busAssignmentFor(use.nodeType, use.propertyKey).role
    const sda = device.uses.find((use) => role(use) === 'sda')
    const scl = device.uses.find((use) => role(use) === 'scl')
    if (!sda || !scl) continue
    const key = `${sda.pin}/${scl.pin}`
    const named = nodes.find((node) => node.id === device.nodeId)
    buses.set(key, [...(buses.get(key) ?? []), named ? nodeLabel(named) : device.nodeType])
  }
  if (buses.size < 2) return []

  const described = [...buses]
    .map(([pins, names]) => `${names.join(' and ')} on SDA ${pins.split('/')[0]} / SCL ${pins.split('/')[1]}`)
    .join('; ')
  return [
    `The generated sketch starts one I2C bus, but this build has ${buses.size}: ${described}. `
    + 'Put every I2C part on the same SDA and SCL pins — sharing them is correct, and only the addresses have to differ.',
  ]
}

/**
 * Which generator this graph would actually be built by.
 *
 * Mirrors the upload path's own order: `sdShowConnected` (`utils/showUpload.ts`)
 * is tested before `isPatternShow`, so the same Music Player graph is an SD
 * player build when a card and an amplifier are present and a pattern show when
 * they are not. Checking the graph shape without that order said no to graphs
 * that would have built fine, and an error nobody can act on teaches people to
 * ignore the drawer.
 *
 * One walk because two checks need it — what can draw a display, and what can
 * honour an LED output's run-time controls. They were about to be two copies.
 */
export type SelectedGenerator = 'sketch' | 'show' | 'player'

export function selectedGenerator(nodes: StudioNode[], edges: StudioEdge[]): SelectedGenerator {
  const master = nodes.find((node) => node.data.nodeType === 'PatternMaster')
  const showEngine = nodes.find((node) => node.data.nodeType === 'PerformanceGenerator')

  const drivesOutput = (source: StudioNode | undefined): boolean => !!source && edges.some((edge) =>
    edge.source === source.id
    && (edge.sourceHandle ?? '') === 'frame'
    && (edge.targetHandle ?? '') === 'frame'
    && nodes.some((node) => node.id === edge.target && node.data.nodeType === 'MatrixOutput'))

  const collectionFeeds = (target: StudioNode | undefined): boolean => !!target && edges.some((edge) =>
    edge.target === target.id
    && (edge.targetHandle ?? '') === 'patternset'
    && nodes.some((node) => node.id === edge.source && node.data.nodeType === 'PatternCollection'))

  if (nodes.some((node) => node.data.nodeType === 'SDCard')
    && nodes.some((node) => node.data.nodeType === 'Amplifier')
    && drivesOutput(master)) return 'player'
  if (drivesOutput(master) && collectionFeeds(master)) return 'show'
  if (drivesOutput(showEngine)) return 'show'
  return 'sketch'
}

/**
 * LED-output blackout and dimming a show or player build would silently drop.
 *
 * `cppGenerator` emits these controls from the wired expression, because a
 * normal sketch evaluates the whole graph. The show and player generators do
 * not: they render collected patterns and a fixed transport, with no way to
 * evaluate an arbitrary node feeding an output's `enabled` pin. Emitting
 * nothing there would flash firmware that ignores a physical blackout button,
 * which is the same failure as a display left dark — the user's next move is
 * to suspect the wiring.
 *
 * The SD player has a real route for this and the message names it: Player
 * Controls' LED On/Off and Brightness reach the same place through the
 * transport bundle the player already reads.
 */
/**
 * Master Speed in a build whose clock is not the sketch's own.
 *
 * A music player's animation time *is* the track position — patterns are
 * synced to what is playing. Scaling that would slide the LEDs off the music,
 * so refusing here is the correct behaviour rather than a missing feature. The
 * show generator's clock also drives pattern dwell, which is a duration in
 * seconds and has no business speeding up with the animation, so it needs a
 * second accumulated clock before it can honour this.
 */
function masterSpeedGeneratorErrors(nodes: StudioNode[], generator: SelectedGenerator): string[] {
  const knobs = nodes.filter((node) => node.data.nodeType === 'MasterSpeed')
  if (knobs.length === 0 || generator === 'sketch') return []
  const names = knobs.map((node) => nodeLabel(node)).join(', ')
  return [generator === 'player'
    ? `${names}: a music-player build animates on the track's own position, so scaling time would slide the LEDs off the music. Remove it, or drive the patterns from a normal sketch.`
    : `${names}: a generated show controller cannot scale animation time yet — its clock also times how long each pattern holds. Remove it before exporting a show.`]
}

export function findOutputRuntimeIssues(
  nodes: StudioNode[],
  edges: StudioEdge[],
): { errors: string[] } {
  const generator = selectedGenerator(nodes, edges)
  if (generator === 'sketch') return { errors: [] }

  const speedErrors = masterSpeedGeneratorErrors(nodes, generator)

  const wired = nodes.filter((node) => node.data.nodeType === 'MatrixOutput'
    && edges.some((edge) => edge.target === node.id
      && (edge.targetHandle === 'enabled' || edge.targetHandle === 'brightness')))
  if (wired.length === 0) return { errors: speedErrors }

  const errors: string[] = []
  const names = wired.map((node) => nodeLabel(node)).join(', ')
  errors.push(generator === 'player'
    ? `${names}: a music-player build cannot read Enabled or Brightness wired to the LED output. `
      + 'Wire the button or knob to Player Controls (LED On / Off, Brightness) instead — it reaches the same place through the transport the player already reads.'
    : `${names}: a generated show controller cannot read Enabled or Brightness wired to the LED output, so the firmware would ignore them. `
      + 'Export it through Upload show to SD and drive them from Player Controls, or remove the wires before exporting a show.')

  return { errors: [...errors, ...speedErrors] }
}

export function findDisplayGeneratorIssues(
  nodes: StudioNode[],
  edges: StudioEdge[],
): { errors: string[]; warnings: string[] } {
  const displays = nodes.filter((node) => DISPLAY_NODE_TYPES.has(node.data.nodeType))
  if (displays.length === 0) return { errors: [], warnings: [] }

  const names = displays.map((node) => nodeLabel(node))
  const errors: string[] = []
  const warnings: string[] = []

  const master = nodes.find((node) => node.data.nodeType === 'PatternMaster')

  // Three generators, not two, and only one of them cannot draw.
  //
  //   normal sketch      cppGenerator          draws displays
  //   SD player          playerSketchGenerator draws displays
  //   pattern show       showGenerator         does not
  if (selectedGenerator(nodes, edges) === 'show') {
    errors.push(
      `A generated show controller cannot drive a display yet, so ${names.join(', ')} would not be built into the firmware. `
      + 'Export it through Upload show to SD, which does drive displays, or remove the display before exporting a show.',
    )
    return { errors, warnings }
  }

  errors.push(...splitI2cBusErrors(nodes))

  // A collection too big to picture bakes nothing, and the panel then says
  // "NO PATTERNS" — the same thing it says for a browser wired to nobody. The
  // difference matters and only this message carries it.
  for (const { display, issue } of browserThumbnailIssues(nodes, edges)) {
    errors.push(`${nodeLabel(display)}: ${issue}`)
  }

  if (master) {
    for (const issue of playerDisplaysFromGraph(nodes as never, edges as never).unresolved) {
      const display = nodes.find((node) => node.id === issue.display)
      warnings.push(
        `${display ? nodeLabel(display) : 'A display'}: ${issue.port} is wired to ${issue.source}, which the SD player sketch cannot read. `
        + 'On the device that value stays blank — wire it to a Music Player output, or drive the display from a normal sketch.',
      )
    }
  }

  return { errors, warnings }
}

export function findPlayerControlMappingWarnings(nodes: StudioNode[], edges: StudioEdge[]): string[] {
  return playerControlMappingIssues(nodes, edges).map((issue) => `${issue.message} — the absolute control will override button changes`)
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
  const terminalName = target === 'group' ? 'Group Output' : 'LED output'
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
      fix: target === 'group' ? 'Recreate the group so it receives a Group Output terminal.' : 'Add one LED output node from the Output section.',
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

  for (const audioNode of nodes.filter((node) =>
    node.data.nodeType === 'Audio' &&
    edges.some((edge) => edge.source === node.id) &&
    !resolveAudioCapabilitySource(options.capabilityNodes ?? nodes, String(node.data.properties.sourceId ?? ''))
  )) {
    diagnostics.push({
      id: `${audioNode.id}-source`,
      severity: 'error',
      category: 'connection',
      title: 'Audio has no attached source',
      message: 'This Audio signal is in use, but it does not resolve to attached audio hardware.',
      fix: 'Add a microphone or line-in ADC in Hardware, or configure an SD player, then choose it from the Audio source list.',
      nodeIds: [audioNode.id],
      nodeLabel: nodeLabel(audioNode),
      propertyKey: 'sourceId',
    })
  }

  // The same walk deploy validation uses. These were separate loops over the
  // same data once and drifted apart, leaving this drawer calling a
  // deliberately shared pin an error after findPinConflicts had stopped.
  const sharedPinUses = deliberatelySharedPinUses(nodes, edges)
  for (const collision of findPinCollisions(collectPinUses(nodes), sharedPinUses)) {
    const uses = collision.uses
    diagnostics.push({
      id: `pin-${collision.pin}`, severity: 'error', category: 'pins',
      title: pinCollisionTitle(collision),
      message: uses.map((use) => use.label).join(' · '),
      fix: pinCollisionFix(collision.reason),
      nodeIds: [...new Set(uses.map((use) => use.nodeId))],
      nodeLabel: uses.length === 2 ? uses.map((use) => use.label).join(' / ') : `${uses.length} pin roles`,
    })
  }
  for (const collision of findI2cAddressCollisions(i2cDevices(nodes))) {
    diagnostics.push({
      id: `i2c-address-${collision.address}`, severity: 'error', category: 'pins',
      title: `Two I2C devices answer to the same address`,
      message: addressCollisionMessage(collision),
      fix: 'Change the address on one device with its strap or solder jumper, or move it to a second I2C bus on different SDA/SCL pins.',
      nodeIds: [...new Set(collision.uses.map((use) => use.nodeId))],
      nodeLabel: 'I2C bus',
    })
  }
  findMirroredOutputMismatches(nodes, edges).forEach((message, index) => {
    diagnostics.push({
      id: `mirror-mismatch-${index}`, severity: 'warning', category: 'layout',
      title: 'Parallel runs are different lengths',
      message,
      fix: 'Nothing to fix if the uneven runs are deliberate. Otherwise match their LED counts, or give one its own data pin so they become independent outputs.',
      nodeIds: [], nodeLabel: 'LED outputs',
    })
  })
  for (const use of collectPinUses(nodes)) {
    if (isValidPinNumber(use.pin)) continue
    diagnostics.push({
      id: `pin-range-${use.nodeId}-${use.label}`, severity: 'warning', category: 'pins',
      title: `${use.label} isn't a valid GPIO number`,
      message: `Set to ${use.pin} — expected a whole number from 0–${MAX_PIN_NUMBER}.`,
      fix: 'Enter a whole number GPIO pin in range for the selected board.',
      nodeIds: [use.nodeId], nodeLabel: use.label,
    })
  }
  if (options.selectedFqbn) {
    const boardPins = findBoardPinCompatibility(nodes, options.selectedFqbn)
    for (const [severity, messages] of [['error', boardPins.errors], ['warning', boardPins.warnings]] as const) {
      messages.forEach((message, index) => diagnostics.push({
        id: `board-pin-${severity}-${index}`,
        severity,
        category: 'pins',
        title: severity === 'error' ? 'Pin is incompatible with the selected board' : 'Selected pin has a board caveat',
        message,
        fix: 'Choose a compatible pin from the board-aware pin picker.',
        nodeIds: collectPinUses(nodes).filter((use) => message.startsWith(use.label)).map((use) => use.nodeId).slice(0, 1),
      }))
    }
  }
  // Board-exact pin standing. Distinct from the FQBN checks above: the chip
  // table cannot tell a XIAO from an S3-DevKitC-1, and only one of them can
  // reach GPIO39 with a jumper wire.
  const exactBoard = findExactBoardPinIssues(nodes)
  const exactPinUses = collectPinUses(nodes)
  for (const [severity, messages] of [['error', exactBoard.errors], ['warning', exactBoard.warnings]] as const) {
    messages.forEach((message, index) => diagnostics.push({
      id: `board-exact-${severity}-${index}`,
      severity,
      category: 'pins',
      title: severity === 'error'
        ? 'Pin is not available on the chosen board'
        : 'Pin has a caveat on the chosen board',
      message,
      fix: severity === 'error'
        ? 'Pick a pin the board brings out to a header, or change the board on the Board node.'
        : 'Check the board pinout before wiring, or move to a pin with no caveat.',
      nodeIds: exactPinUses.filter((use) => message.startsWith(use.label)).map((use) => use.nodeId).slice(0, 1),
    }))
  }

  const matrixOutputs = nodes.filter((node) => node.data.nodeType === 'MatrixOutput')
  const matrixOutput = matrixOutputs[0]
  const hub75Issues = findHub75ConfigIssues(nodes)
  for (const matrixOutput of matrixOutputs) {
    const props = matrixOutput.data.properties as Record<string, unknown>
    const width = Math.max(0, Math.round(Number(props.width ?? 0)))
    const height = Math.max(0, Math.round(Number(props.height ?? 0)))
    validateMatrixLayout(width, height, props).forEach((message, index) => {
      diagnostics.push({
        id: `${matrixOutput.id}-layout-${index}`, severity: 'error', category: 'layout',
        title: 'Matrix layout is invalid', message,
        fix: 'Correct the panel grid, rotations, or custom XY map in the LED output layout controls.',
        nodeIds: [matrixOutput.id], nodeLabel: nodeLabel(matrixOutput),
      })
    })
    const hub75Issue = hub75Issues.find((issue) => issue.nodeId === matrixOutput.id)
    if (hub75Issue) {
      diagnostics.push({
        id: `${matrixOutput.id}-hub75-config`, severity: 'error', category: 'layout',
        title: 'HUB75 configuration is not supported',
        message: hub75Issue.message,
        fix: 'Switch to an addressable chipset, or adjust the HUB75 route to a single LED output using Matrix or Panels layout with Supersample off.',
        nodeIds: [matrixOutput.id], nodeLabel: nodeLabel(matrixOutput),
      })
    }
  }

  const { w: expressionWidth, h: expressionHeight } = compositionDims(nodes, edges)
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
    if (node.data.nodeType !== 'CustomFormula' && node.data.nodeType !== 'FieldFormula') continue
    const formula = String((node.data.properties as Record<string, unknown>).formula ?? '')
    if (isNodeFormulaValid(formula)) continue
    diagnostics.push({
      id: `${node.id}-formula`, severity: 'error', category: 'expression',
      title: `${nodeLabel(node)} has an invalid formula`,
      message: `formula: ${formula || '(empty)'}`,
      fix: 'Formulas may use only numbers, the built-in variables (x, y, cx, cy, r, angle, t, W, H, a, b, fieldIn), the FastLED shims, and arithmetic — no statements or other identifiers. Preview and firmware both render this node blank until it parses.',
      nodeIds: [node.id], nodeLabel: nodeLabel(node), propertyKey: 'formula',
    })
  }

  for (const node of nodes) {
    if (node.data.nodeType !== 'RTCInput') continue
    const props = node.data.properties as Record<string, unknown>
    if (String(props.timeSource ?? 'Compile Time') !== 'Manual') continue
    if (isValidRtcDateTime({
      year: Number(props.startYear ?? 0),
      month: Number(props.startMonth ?? 0),
      day: Number(props.startDay ?? 0),
      hour: Number(props.startHour ?? 0),
      minute: Number(props.startMinute ?? 0),
      second: Number(props.startSecond ?? 0),
    })) continue
    diagnostics.push({
      id: `${node.id}-rtc-manual-start`,
      severity: 'warning',
      category: 'preview',
      title: `${nodeLabel(node)} has an invalid manual clock start`,
      message: 'The generated firmware clock will stay invalid until the manual year, month, day, hour, minute, and second form a real calendar time.',
      fix: 'Enter a real local date/time, or switch the RTC Clock node back to Compile Time.',
      nodeIds: [node.id],
      nodeLabel: nodeLabel(node),
    })
  }

  // Clock modes have no implicit browser/hardware clock. DateTime is the normal
  // one-wire source; Seconds Today remains a supported legacy/synthetic feed.
  for (const node of nodes) {
    if (node.data.nodeType !== 'ClockDisplay') continue
    const mode = String((node.data.properties as Record<string, unknown>).displayMode ?? 'Digital HH:MM')
    if (mode === 'Stopwatch' || mode === 'Timer') continue
    if (edges.some((e) => e.target === node.id && (e.targetHandle === 'dateTime' || e.targetHandle === 'secondsOfDay'))) continue
    diagnostics.push({
      id: `${node.id}-clock-no-time`,
      severity: 'warning',
      category: 'connection',
      title: `${nodeLabel(node)} has no clock wired`,
      message: 'No DateTime source is connected, so preview and generated firmware display “--:--”.',
      fix: 'Wire an RTC Clock node’s DateTime output into this node, or switch it to Stopwatch/Timer.',
      nodeIds: [node.id],
      nodeLabel: nodeLabel(node),
    })
  }

  findNetworkConfigWarnings(nodes).forEach((message, index) => {
    diagnostics.push({
      id: `network-config-${index}`,
      severity: 'warning',
      category: 'board',
      title: 'Network configuration needs attention',
      message,
      fix: 'Use one shared Wi-Fi setup across DMX / RTC nodes, and complete every required address field.',
      nodeIds: [],
    })
  })

  findScheduleIssues(nodes, edges).forEach((issue, index) => {
    const node = nodes.find((entry) => entry.id === issue.nodeId)
    diagnostics.push({
      id: `schedule-${issue.nodeId}-${index}`,
      severity: 'warning',
      category: 'connection',
      title: 'Schedule setup is incomplete',
      message: issue.message,
      fix: issue.fix,
      nodeIds: [issue.nodeId],
      nodeLabel: node ? nodeLabel(node) : undefined,
    })
  })

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
      fix: 'Enable the global power cap in the Board controller settings and enter the continuous current rating of the LED power supply.',
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

  if (options.selectedFqbn && !inmp441SupportedForBoard(options.selectedFqbn)) {
    for (const node of nodes.filter((entry) => entry.data.nodeType === 'MicInput')) {
      diagnostics.push({
        id: `${node.id}-board`, severity: 'error', category: 'board',
        title: 'Microphone is incompatible with the selected board',
        message: INMP441_UNSUPPORTED_MESSAGE,
        fix: 'Choose a board with INMP441 support in Board & Port, or remove the Microphone node.',
        nodeIds: [node.id], nodeLabel: nodeLabel(node), action: 'choose-board',
      })
    }
  }

  if (options.selectedFqbn && !options.selectedFqbn.startsWith('esp32:esp32:esp32s3')) {
    for (const node of nodes.filter((entry) => entry.data.nodeType === 'LineInput')) {
      diagnostics.push({
        id: `${node.id}-board`, severity: 'error', category: 'board',
        title: 'Line in is incompatible with the selected board',
        message: 'PCM1802 line-in firmware currently requires an ESP32-S3 board for its synchronized four-wire I2S receive path.',
        fix: 'Choose an ESP32-S3 board in Board & Port, or remove the Line In hardware.',
        nodeIds: [node.id], nodeLabel: nodeLabel(node), action: 'choose-board',
      })
    }
  }

  if (options.selectedFqbn && !options.selectedFqbn.startsWith('esp32:')) {
    for (const node of nodes.filter((entry) =>
      entry.data.nodeType === 'DMXInput' && String((entry.data.properties as Record<string, unknown>).inputMode ?? 'Art-Net') === 'DMX512'
    )) {
      diagnostics.push({
        id: `${node.id}-board-dmx512`, severity: 'error', category: 'board',
        title: 'DMX512 input is incompatible with the selected board',
        message: 'The generated DMX512 receiver uses esp_dmx, which is ESP32-only.',
        fix: 'Choose an ESP32-family board in Board & Port, or switch the DMX node to Art-Net mode.',
        nodeIds: [node.id], nodeLabel: nodeLabel(node), action: 'choose-board',
      })
    }
  }

  if (options.selectedFqbn && !options.selectedFqbn.startsWith('esp32:') && !options.selectedFqbn.startsWith('esp8266:')) {
    for (const node of nodes.filter((entry) => {
      const props = entry.data.properties as Record<string, unknown>
      return (entry.data.nodeType === 'DMXInput' && String(props.inputMode ?? 'Art-Net') === 'Art-Net')
        || (entry.data.nodeType === 'RTCInput' && String(props.timeSource ?? 'Compile Time') === 'NTP')
    })) {
      diagnostics.push({
        id: `${node.id}-board-network`, severity: 'error', category: 'board',
        title: 'Network sync is incompatible with the selected board',
        message: 'Art-Net receive and NTP time sync need a Wi-Fi-capable ESP32-family board or ESP8266 target.',
        fix: 'Choose an ESP32-family board / ESP8266 in Board & Port, or switch the node back to a non-network mode.',
        nodeIds: [node.id], nodeLabel: nodeLabel(node), action: 'choose-board',
      })
    }
  }

  // Everything the music-sync player needs named rather than guessed. The
  // generator itself is the node to select for all of them: it is the node that
  // declares the show, and the one whose missing wire is the usual cause.
  const generator = nodes.find((node) => node.data.nodeType === 'PerformanceGenerator')
  if (generator) {
    const show = resolveShowTarget(nodes, edges)
    if (show.problem === 'unconnected') {
      diagnostics.push({
        id: `${generator.id}-show-target`, severity: 'error', category: 'show',
        title: 'The show is not going anywhere',
        message: 'Performance Generator has music and patterns but no LED output, so nothing says which hardware the player should drive.',
        fix: 'Wire the generator\'s Show output into an LED output. The edge carries no pixels — the player drives the LEDs from the card — but it is what names the destination.',
        nodeIds: [generator.id], nodeLabel: nodeLabel(generator),
      })
    } else if (show.problem === 'ambiguous') {
      diagnostics.push({
        id: `${generator.id}-show-target-many`, severity: 'error', category: 'show',
        title: 'The show drives more than one LED output',
        message: `The SD player allocates one LED array and one controller, but this show reaches ${show.reached.length} outputs.`,
        fix: 'Disconnect all but the output the show plays on.',
        nodeIds: [generator.id, ...show.reached.map((node) => node.id)], nodeLabel: nodeLabel(generator),
      })
    }
    if (!nodes.some((node) => node.data.nodeType === 'SDCard')) {
      diagnostics.push({
        id: `${generator.id}-show-card`, severity: 'error', category: 'show',
        title: 'The music show has no SD Card',
        message: 'The player reads the song and its timed show file off the card while it runs, so a show without one has nothing to play.',
        fix: 'Add an SD Card in the hardware view and set its SPI pins.',
        nodeIds: [generator.id], nodeLabel: nodeLabel(generator),
      })
    }
    // The board's own pins are not an answer here: an I2S amplifier, an I2S DAC
    // and an analog amp are three parts wired three ways, and the player emits
    // code for whichever one is on the bench.
    const amplifier = nodes.find((node) => node.data.nodeType === 'Amplifier')
    if (!amplifier) {
      diagnostics.push({
        id: `${generator.id}-show-audio`, severity: 'error', category: 'show',
        title: 'The music show has nothing to play the song through',
        message: 'Nothing on the bench turns the decoded song into sound, so the player has no audio hardware to generate code for.',
        fix: 'Add an Amplifier in the hardware view. A MAX98357A drives a speaker straight off I2S; an I2S DAC or an analog amp are the other shapes.',
        nodeIds: [generator.id], nodeLabel: nodeLabel(generator),
      })
    } else if (audioOutputMissing(nodes, options.selectedFqbn ?? '')) {
      diagnostics.push({
        id: `${amplifier.id}-audio-out`, severity: 'error', category: 'board',
        title: 'This audio module cannot make a sound on this board',
        message: 'An analog amplifier needs line level, which comes from an internal DAC — and only the classic ESP32 has one.',
        fix: 'Switch to an I2S module (MAX98357A, PCM5102A, UDA1334A), or choose a classic ESP32.',
        nodeIds: [amplifier.id], nodeLabel: nodeLabel(amplifier),
      })
    }
  }

  const master = nodes.find((node) => node.data.nodeType === 'PatternMaster')
  if (master && !incoming.has(`${master.id}:patternset`)) {
    diagnostics.push({
      id: `${master.id}-patterns`, severity: 'warning', category: 'show',
      title: 'Music Player has no patterns',
      message: 'No Pattern Collection is wired to the Music Player.',
      fix: 'Connect a Pattern Collection pattern-set output to the Music Player.',
      nodeIds: [master.id], nodeLabel: nodeLabel(master),
    })
  }

  for (const issue of playerControlMappingIssues(nodes, edges)) {
    diagnostics.push({
      id: issue.id,
      severity: 'warning',
      category: 'connection',
      title: `${issue.domain === 'volume' ? 'Volume' : 'Brightness'} controls conflict`,
      message: `${issue.message}. The absolute control will override button changes.`,
      fix: `Disconnect either the absolute ${issue.domain} input or its up/down button inputs from this Player Controls chain.`,
      nodeIds: issue.nodeIds,
      nodeLabel: issue.nodeLabel,
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
      isPortlessNodeType(node.data.nodeType) ||
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
      /*
       * A frame is the only thing that reaches an LED output — the SD card is a
       * bench part rather than a cable into this node.
       *
       * An SD show used to be excused from this, on the grounds that the player
       * drives its LEDs from the card so the output is configured rather than
       * wired. The exception is gone: the Performance Generator has a `frame`
       * output now and the show's destination is that edge, so a show answers
       * this requirement the same way every other graph does.
       */
      if (!incoming.has(`${out.id}:frame`)) {
        errors.push(outputs.length === 1
          ? 'LED output has no Frame input connected'
          : `LED output ${index + 1} has no Frame input connected`)
      }
    }
  }

  errors.push(...findPinConflicts(nodes, edges))
  errors.push(...findOutputResourceErrors(nodes))
  errors.push(...findMatrixLayoutErrors(nodes))
  errors.push(...findShowOutputFormErrors(nodes, edges))
  errors.push(...findShowRequirementErrors(nodes, edges, selectedFqbn))
  errors.push(...findAudioCapabilityErrors(nodes, edges))
  errors.push(...findStorageCapabilityErrors(nodes, edges))

  errors.push(...findHub75ConfigErrors(nodes))
  errors.push(...findScalarExpressionErrors(nodes))
  errors.push(...findFormulaErrors(nodes))
  errors.push(...findBoardCompatibilityErrors(nodes, selectedFqbn))
  warnings.push(...findPreviewOnlyWarnings(nodes, edges))
  warnings.push(...findRtcWarnings(nodes))
  warnings.push(...findNetworkConfigWarnings(nodes))
  warnings.push(...findScheduleIssues(nodes, edges).map((issue) => issue.message))
  warnings.push(...findPinRangeWarnings(nodes))
  warnings.push(...findBoardPinCompatibility(nodes, selectedFqbn).warnings)
  warnings.push(...findPlayerControlMappingWarnings(nodes, edges))
  const displayIssues = findDisplayGeneratorIssues(nodes, edges)
  errors.push(...displayIssues.errors)
  warnings.push(...displayIssues.warnings)
  errors.push(...findOutputRuntimeIssues(nodes, edges).errors)

  const power = estimatePowerLoad(nodes)
  if (power?.exceedsConfigured) {
    warnings.push(
      `Worst-case draw (~${power.worstCaseMa} mA for ${power.ledCount} LEDs) exceeds the configured power cap (${power.configuredMa} mA) — FastLED will auto-dim to stay under it`
    )
  }

  warnings.push(...findMirroredOutputMismatches(nodes, edges))

  const ram = estimateFirmwareRam(nodes, edges)
  if (ram && !ram.usesPsram && ram.internalBytes > INTERNAL_RAM_WARN_BYTES) {
    warnings.push(
      `Estimated internal RAM for render buffers (~${Math.round(ram.internalBytes / 1024)} KB) is large for many boards — consider enabling MatrixOutput's "Use PSRAM" toggle if the selected board supports it`
    )
  }

  const master = nodes.find(n => n.data.nodeType === 'PatternMaster')
  if (master && !incoming.has(`${master.id}:patternset`)) {
    warnings.push('Music Player has no Pattern Collection wired')
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
    !isPortlessNodeType(n.data.nodeType) &&
    !edges.some(e => e.source === n.id || e.target === n.id)
  )
  if (isolated.length > 0)
    warnings.push(`${isolated.length} node${isolated.length > 1 ? 's' : ''} not connected to anything`)

  return { errors, warnings }
}
