import type { StudioNode, StudioEdge } from '../state/graphStore'
import { SPI_CHIPSETS, HUB75_CHIPSET, NODE_LIBRARY, supportsScalarExpression, gpioRequirementForProperty, libraryDefaults, type GpioPropertyRequirement } from '../state/nodeLibrary'
import { evaluateScalarExpression } from '../state/scalarExpression'
import { isValidRtcDateTime } from '../state/rtc'
import { validateMatrixLayout, tileRotationAt } from '../state/xyLayout'
import { compositionDims } from '../state/outputRouting'
import { boardGpioInfo } from '../state/uploadStore'
import { MAX_PIN_NUMBER, pinSupports } from '../state/boardGpio'
import { getNetworkCredentials } from '../state/networkCredentials'

export interface ValidationResult {
  errors:   string[]
  warnings: string[]
}

// Boards ESP32-HUB75-MatrixPanel-DMA actually supports (its 'LCD mode' DMA
// peripheral) — the classic ESP32 and its S2/S3 successors, not the RISC-V
// C3/C6/H2 variants (or any other board family). Plain base FQBNs: the
// upload UI passes `selectedFqbn` without a `:PSRAM=…` suffix here (that's
// only appended at the actual build/compile call site).
const HUB75_SUPPORTED_FQBNS = new Set(['esp32:esp32:esp32', 'esp32:esp32:esp32s2', 'esp32:esp32:esp32s3'])

interface PinUse {
  label: string
  nodeId: string
  nodeType: string
  propertyKey: string
  pin: number
  requirement: GpioPropertyRequirement | null
}

// Every GPIO-typed property across the hardware-input/output nodes, tagged
// with a human label for the error message. MatrixOutput's clockPin only
// counts for SPI chipsets (it's unused, and its editor disabled, otherwise);
// a HUB75 chipset swaps the single dataPin/clockPin pair for its own 13-14
// pin ribbon (hub75EPin only when hub75WideScan is on — see
// docs/development/design/hub75-output.md). There is no shared-bus concept
// in the generated firmware today — each of these pins drives exactly one
// peripheral — so any reuse of a GPIO number across two of these roles (even
// on the same node) is a real conflict.
function collectPinUses(nodes: StudioNode[]): PinUse[] {
  const uses: PinUse[] = []
  const matrixOutputs = nodes.filter((node) => node.data.nodeType === 'MatrixOutput')
  const matrixOrdinal = new Map(matrixOutputs.map((node, index) => [node.id, index + 1]))
  const push = (node: StudioNode, label: string, propertyKey: string, value: unknown) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return
    const nodeType = node.data.nodeType
    const props = node.data.properties as Record<string, unknown>
    uses.push({
      label,
      nodeId: node.id,
      nodeType,
      propertyKey,
      pin: value,
      requirement: gpioRequirementForProperty(nodeType, propertyKey, props),
    })
  }
  for (const n of nodes) {
    const props = n.data.properties as Record<string, unknown>
    const baseLabel = String(n.data.label ?? n.data.nodeType)
    const label = n.data.nodeType === 'MatrixOutput' && matrixOutputs.length > 1
      ? `${baseLabel} ${matrixOrdinal.get(n.id)}`
      : baseLabel
    switch (n.data.nodeType) {
      case 'MicInput':
        push(n, `${label} I2S WS`, 'i2sWs', props.i2sWs)
        push(n, `${label} I2S SCK`, 'i2sSck', props.i2sSck)
        push(n, `${label} I2S SD`, 'i2sSd', props.i2sSd)
        break
      case 'DMXInput':
        if (String(props.inputMode ?? 'Art-Net') !== 'DMX512') break
        push(n, `${label} TX pin`, 'dmxTxPin', props.dmxTxPin)
        push(n, `${label} RX pin`, 'dmxRxPin', props.dmxRxPin)
        push(n, `${label} enable pin`, 'dmxEnablePin', props.dmxEnablePin)
        break
      case 'MatrixOutput':
        if (String(props.chipset ?? 'WS2812B') === HUB75_CHIPSET) {
          // Regression: a MatrixOutput created before HUB75 existed (or before
          // the user ever opened "HUB75 Wiring") has none of these keys on its
          // own saved properties — StudioNode.tsx's editor only *displays* the
          // library default (merged in for the UI), it never writes it back
          // onto the node. `push()` silently skips a non-number, so without
          // this fallback these pins escaped every conflict/board-compat
          // check entirely while codegen (hub75HardwareFromProps) baked in
          // that same default regardless — confirmed on real hardware: the
          // unchecked G1/B1 defaults (26/27) collide with the ESP32-S3's
          // flash/PSRAM pins, and A (23) isn't present as GPIO on the S3 at
          // all, producing an ESP-IDF "GPIO number error" boot failure that
          // no validation had ever seen. Merge the library defaults first so
          // validation always checks the pins that will actually be flashed.
          const hub75Props = { ...libraryDefaults('MatrixOutput'), ...props }
          push(n, `${label} R1 pin`, 'hub75R1Pin', hub75Props.hub75R1Pin)
          push(n, `${label} G1 pin`, 'hub75G1Pin', hub75Props.hub75G1Pin)
          push(n, `${label} B1 pin`, 'hub75B1Pin', hub75Props.hub75B1Pin)
          push(n, `${label} R2 pin`, 'hub75R2Pin', hub75Props.hub75R2Pin)
          push(n, `${label} G2 pin`, 'hub75G2Pin', hub75Props.hub75G2Pin)
          push(n, `${label} B2 pin`, 'hub75B2Pin', hub75Props.hub75B2Pin)
          push(n, `${label} row-select A`, 'hub75APin', hub75Props.hub75APin)
          push(n, `${label} row-select B`, 'hub75BPin', hub75Props.hub75BPin)
          push(n, `${label} row-select C`, 'hub75CPin', hub75Props.hub75CPin)
          push(n, `${label} row-select D`, 'hub75DPin', hub75Props.hub75DPin)
          if (hub75Props.hub75WideScan === true) push(n, `${label} row-select E`, 'hub75EPin', hub75Props.hub75EPin)
          push(n, `${label} clock pin`, 'hub75ClkPin', hub75Props.hub75ClkPin)
          push(n, `${label} latch pin`, 'hub75LatPin', hub75Props.hub75LatPin)
          push(n, `${label} output-enable pin`, 'hub75OePin', hub75Props.hub75OePin)
        } else {
          push(n, `${label} data pin`, 'dataPin', props.dataPin)
          if (SPI_CHIPSETS.has(String(props.chipset ?? 'WS2812B'))) push(n, `${label} clock pin`, 'clockPin', props.clockPin)
        }
        break
      case 'ButtonInput':
        push(n, `${label} pin`, 'pin', props.pin)
        break
      case 'PotInput':
        push(n, `${label} pin`, 'pin', props.pin)
        break
      case 'EncoderInput':
        push(n, `${label} pin A`, 'pinA', props.pinA)
        push(n, `${label} pin B`, 'pinB', props.pinB)
        push(n, `${label} switch pin`, 'pinSW', props.pinSW)
        break
      case 'SDCard':
        push(n, `${label} CS pin`, 'sdCsPin', props.sdCsPin)
        if (props.audioOutput === 'internalDac') {
          // ESP32-audioI2S's internal-DAC mode is fixed to these two pins.
          push(n, `${label} internal DAC (GPIO25)`, 'internalDac', 25)
          push(n, `${label} internal DAC (GPIO26)`, 'internalDac', 26)
        } else {
          push(n, `${label} I2S BCLK`, 'i2sBclk', props.i2sBclk)
          push(n, `${label} I2S LRC`, 'i2sLrc', props.i2sLrc)
          push(n, `${label} I2S DOUT`, 'i2sDout', props.i2sDout)
        }
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

export function estimatePowerLoad(nodes: StudioNode[]): PowerEstimate | null {
  const outputs = nodes.filter((node) => node.data.nodeType === 'MatrixOutput')
  if (outputs.length === 0) return null
  const ledCount = outputs.reduce((sum, output) => {
    const props = output.data.properties as Record<string, unknown>
    return sum + Math.max(0, Math.round(Number(props.width ?? 0))) * Math.max(0, Math.round(Number(props.height ?? 0)))
  }, 0)
  const worstCaseMa = outputs.reduce((sum, output) => {
    const props = output.data.properties as Record<string, unknown>
    const pixels = Math.max(0, Math.round(Number(props.width ?? 0))) * Math.max(0, Math.round(Number(props.height ?? 0)))
    const rate = String(props.chipset ?? 'WS2812B') === HUB75_CHIPSET ? MA_PER_HUB75_PIXEL_WORST_CASE : MA_PER_LED_WORST_CASE
    return sum + pixels * rate
  }, 0)
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
  const usesPsram = outputs.some((output) => (output.data.properties as Record<string, unknown>).usePsram === true)
  const psramBytes = usesPsram ? frameBufferBytes + fieldBufferBytes : 0
  const internalBytes = ledsArrayBytes + statefulBytes + paletteBytes + (usesPsram ? 0 : frameBufferBytes + fieldBufferBytes)

  return { ledCount, ledsArrayBytes, frameBufferBytes, fieldBufferBytes, statefulBytes, paletteBytes, usesPsram, internalBytes, psramBytes }
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
    const width = Math.max(0, Math.round(Number(props.width ?? 0)))
    const height = Math.max(0, Math.round(Number(props.height ?? 0)))
    const base = String(output.data.label ?? output.data.nodeType)
    const label = nodes.filter((node) => node.data.nodeType === 'MatrixOutput').length > 1 ? `${base} ${index + 1}` : base
    return validateMatrixLayout(width, height, props).map((message) => `${label}: ${message}`)
  })
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
    if (String(props.chipset ?? 'WS2812B') !== HUB75_CHIPSET) return
    const base = String(output.data.label ?? output.data.nodeType)
    const label = matrixOutputs.length > 1 ? `${base} ${index + 1}` : base
    if (!singleOutput) {
      issues.push({
        nodeId: output.id, label,
        message: `${label} is set to HUB75, which only supports a single Matrix Output route by design — remove the other output route(s), or switch this one to an addressable chipset.`,
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

export function findBoardCompatibilityErrors(nodes: StudioNode[], selectedFqbn: string): string[] {
  const errors: string[] = []
  if (selectedFqbn && nodes.some((node) => node.data.nodeType === 'MicInput') && !selectedFqbn.startsWith('esp32:')) {
    errors.push('Microphone firmware requires an ESP32-family board because INMP441 capture uses the ESP-IDF I2S driver')
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
  const internalDacSd = nodes.find((node) =>
    node.data.nodeType === 'SDCard' && (node.data.properties as Record<string, unknown>).audioOutput === 'internalDac'
  )
  // Only the classic ESP32 has the DAC peripheral ESP32-audioI2S's internal-DAC
  // mode drives; S3/S2/C3 have no DAC hardware at all.
  if (selectedFqbn && internalDacSd && selectedFqbn !== 'esp32:esp32:esp32') {
    errors.push('SD Card internal-DAC audio output requires the classic ESP32 board — ESP32-S3/S2/C3 have no built-in DAC')
  }
  // ESP32-HUB75-MatrixPanel-DMA needs the ESP32/S2/S3 'LCD mode' DMA
  // peripheral; RISC-V ESP32 variants (C3/C6/H2) have no such hardware, per
  // the library's own supported-variants list — confirmed against its README
  // at the vendored tag, not guessed. Every other board family (AVR, RP2040,
  // SAMD, STM32, Teensy, ESP8266, …) is out entirely too.
  if (selectedFqbn && nodes.some((node) =>
    node.data.nodeType === 'MatrixOutput' && String((node.data.properties as Record<string, unknown>).chipset ?? 'WS2812B') === HUB75_CHIPSET
  ) && !HUB75_SUPPORTED_FQBNS.has(selectedFqbn)) {
    errors.push('HUB75 output requires a classic ESP32, ESP32-S2, or ESP32-S3 board — the DMA library needs their LCD-mode peripheral, which RISC-V ESP32 variants (C3/C6/H2) and other board families don\'t have')
  }
  errors.push(...findBoardPinCompatibility(nodes, selectedFqbn).errors)
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
  const hub75Issues = findHub75ConfigIssues(nodes)
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
    const hub75Issue = hub75Issues.find((issue) => issue.nodeId === matrixOutput.id)
    if (hub75Issue) {
      diagnostics.push({
        id: `${matrixOutput.id}-hub75-config`, severity: 'error', category: 'layout',
        title: 'HUB75 configuration is not supported',
        message: hub75Issue.message,
        fix: 'Switch to an addressable chipset, or adjust the HUB75 route to a single Matrix Output using Matrix or Panels layout with Supersample off.',
        nodeIds: [matrixOutput.id], nodeLabel: nodeLabel(matrixOutput),
      })
    }
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

  // A Clock Display in a clock mode draws the browser clock in preview as an
  // authoring aid, but hardware has no time source of its own — without an RTC
  // wired in, the flashed sketch can only ever show dashes.
  for (const node of nodes) {
    if (node.data.nodeType !== 'ClockDisplay') continue
    const mode = String((node.data.properties as Record<string, unknown>).displayMode ?? 'Digital HH:MM')
    if (mode === 'Stopwatch' || mode === 'Timer') continue
    if (edges.some((e) => e.target === node.id && e.targetHandle === 'secondsOfDay')) continue
    diagnostics.push({
      id: `${node.id}-clock-no-time`,
      severity: 'warning',
      category: 'connection',
      title: `${nodeLabel(node)} has no clock wired`,
      message: 'Preview falls back to this browser’s clock, but the generated firmware has no time source and will display “--:--”.',
      fix: 'Wire an RTC Clock node’s Seconds Today output into this node, or switch it to Stopwatch/Timer.',
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

  if (options.selectedFqbn && options.selectedFqbn !== 'esp32:esp32:esp32') {
    for (const node of nodes.filter((entry) =>
      entry.data.nodeType === 'SDCard' && (entry.data.properties as Record<string, unknown>).audioOutput === 'internalDac'
    )) {
      diagnostics.push({
        id: `${node.id}-board`, severity: 'error', category: 'board',
        title: 'Internal-DAC audio output is incompatible with the selected board',
        message: 'Only the classic ESP32 has the built-in DAC peripheral; ESP32-S3/S2/C3 have none.',
        fix: 'Choose the classic ESP32 board in Board & Port, or switch the SD Card node to I2S output.',
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
  errors.push(...findHub75ConfigErrors(nodes))
  errors.push(...findScalarExpressionErrors(nodes))
  errors.push(...findBoardCompatibilityErrors(nodes, selectedFqbn))
  warnings.push(...findPreviewOnlyWarnings(nodes, edges))
  warnings.push(...findRtcWarnings(nodes))
  warnings.push(...findNetworkConfigWarnings(nodes))
  warnings.push(...findScheduleIssues(nodes, edges).map((issue) => issue.message))
  warnings.push(...findPinRangeWarnings(nodes))
  warnings.push(...findBoardPinCompatibility(nodes, selectedFqbn).warnings)

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
