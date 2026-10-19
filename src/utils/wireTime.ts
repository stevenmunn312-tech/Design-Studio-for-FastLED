/**
 * How long the LEDs take to send a frame on the selected board, and the
 * Graph Health advice when that wire time, not the work, sets the frame rate.
 *
 * Every figure comes from `src/build/ledDrivers.ts` (the pinned FastLED
 * 3.10.5): each output's send time from `chipsetSendMicros`, how many send at
 * once from the board family's driver facts. The model, recorded in
 * docs/development/patterns/validation-and-deploy.md:
 *
 * - every leading LED output (parallel mirrors share a pin and an array) and
 *   both rails of a wired Stereo VU Meter is one output; HUB75 is refreshed
 *   by DMA and left out; an output split into `dataLanes` counts each lane as
 *   an output of `ceil(leds / lanes)` LEDs;
 * - clockless outputs share the board's default clockless driver, which sends
 *   up to `ledOutputConcurrency` of them at once and the rest in turn as a
 *   slot frees: FastLED's RMT worker pool queues every output and starts each
 *   on the first free channel, so the outputs are list-scheduled over that
 *   many slots, longest first (the RMT5 engine sorts by size);
 * - clocked (SPI) outputs are counted one after another and added on top,
 *   which is the conservative reading of a per-controller SPI send;
 * - on RMT chips the slots are bounded by RMT memory: with no network every
 *   channel fits single-buffered (FastLED drops to one block a channel under
 *   memory pressure rather than refuse one); with Wi-Fi or Ethernet up its
 *   network channel reduction keeps only the channels that fit at the network
 *   rate (`rmtOutputsThatFit`), at least one, and the rest wait their turn.
 *
 * The wire time is compared with the Board's frame period. Rendering, audio
 * and network work come on top, so a graph within this bound can still miss
 * its rate, but one past it cannot meet it however light the pattern is.
 */
import type { StudioEdge, StudioNode } from '../state/graphStore'
import { leadingOutputRoutes } from '../state/output/outputRouting'
import { outputForm, outputLedTotal } from '../state/output/ledOutputForm'
import { DEFAULT_STANDALONE_VU_LED_COUNT } from '../state/audio/stereoVuSizing'
import { selectedPhysicalBoardProfile } from '../build/boards/boardProfiles'
import { targetFamilyFromFqbn, type BuildTargetFamily } from '../build/buildProfile'
import { controllerSettings, FRAME_RATE } from '../build/controllerSettings'
import {
  CHIPSET_WIRE, chipsetSendMicros, clockedRateFix, effectiveDataRateMhz, ledDriverFacts, rmtOutputsThatFit,
  type LedDriverFacts,
} from '../build/ledDrivers'
import { networkSourceIn } from '../codegen/peripherals/networkCpp'
import { IR_RMT_RX_FAMILIES, IR_RMT_RX_SYMBOLS } from '../codegen/peripherals/irRmtReceiverCpp'
import type { GraphDiagnostic, GraphDiagnosticFix } from './validateGraph'

/** One data pin's send: an LED output, one of its lanes, or a VU rail. */
export interface WireOutput {
  /** The node whose data pin this is. */
  nodeId: string
  label: string
  chipset: string
  leds: number
  /** Clocked (SPI) chipsets do not share the clockless driver's slots. */
  clocked: boolean
  micros: number
  /** The LED output's `dataRateMhz`, for the faster-clock fix; absent on VU rails. */
  dataRateMhz?: unknown
}

export interface RmtWireUse {
  /** Clockless outputs that want an RMT channel at once. */
  wanted: number
  /** Channels that fit at the network rate, after the IR receiver's share. */
  fitWithNetwork: number
  /** Words each channel asks for with the network up. */
  wordsPerChannel: number
  /** TX words the chip has. */
  txMemoryWords: number
  /** Words an IR receiver holds in the same pool. */
  reservedWords: number
}

export interface WireTimeEstimate {
  outputs: WireOutput[]
  ledCount: number
  controllerCount: number
  facts: LedDriverFacts
  family: BuildTargetFamily
  /** The Board's `ledDriver` ('auto' until step 7 offers others). */
  driver: string
  networkActive: boolean
  /** Clockless outputs sent at once. */
  concurrency: number
  /** Wire time of one frame. */
  estimatedMicros: number
  /** Wire-only ceiling, before rendering and audio work. */
  maxWireFps: number
  /** The Board's frame rate. */
  frameRate: number
  /** The frame rate the wire allows, never above the Board's. */
  reachableFps: number
  /** The wire cannot send a frame within the Board's frame period. */
  wireBound: boolean
  /** Present on chips whose clockless driver is RMT. */
  rmt: RmtWireUse | null
}

const positiveInt = (value: unknown, fallback: number): number => {
  const n = Math.floor(Number(value))
  return Number.isFinite(n) && n >= 1 ? n : fallback
}

/** The rate a clocked chipset actually sends at, in Hz (step 5's `dataRateMhz`, default when absent). */
function dataRateHz(chipset: string, props: Record<string, unknown>): number | undefined {
  const mhz = effectiveDataRateMhz(chipset, props.dataRateMhz)
  return mhz === null ? undefined : mhz * 1_000_000
}

function isClocked(chipset: string): boolean {
  return CHIPSET_WIRE[chipset]?.kind === 'clocked'
}

/** Every data pin FastLED sends on in one `show()`. */
export function wireOutputs(nodes: StudioNode[], edges: readonly StudioEdge[]): WireOutput[] {
  const outputs: WireOutput[] = []
  for (const route of leadingOutputRoutes(nodes, edges as StudioEdge[])) {
    const props = route.node.data.properties as Record<string, unknown>
    if (outputForm(props) === 'hub75') continue
    const chipset = String(props.chipset ?? 'WS2812B')
    const leds = outputLedTotal(props)
    const lanes = Math.min(positiveInt(props.dataLanes, 1), leds)
    const laneLeds = Math.ceil(leds / lanes)
    const rate = dataRateHz(chipset, props)
    for (let lane = 0; lane < lanes; lane += 1) {
      outputs.push({
        nodeId: route.node.id,
        label: lanes > 1 ? `${route.label} lane ${lane + 1}` : route.label,
        chipset,
        leds: laneLeds,
        clocked: isClocked(chipset),
        micros: chipsetSendMicros(chipset, laneLeds, rate),
        dataRateMhz: props.dataRateMhz,
      })
    }
  }
  for (const meter of nodes) {
    if (meter.data.nodeType !== 'StereoVuMeter') continue
    if (!edges.some((edge) => edge.target === meter.id && edge.targetHandle === 'audio')) continue
    const props = meter.data.properties as Record<string, unknown>
    const leds = positiveInt(Math.round(Number(props.ledCount ?? DEFAULT_STANDALONE_VU_LED_COUNT)), DEFAULT_STANDALONE_VU_LED_COUNT)
    const chipset = String(props.chipset ?? 'WS2812B')
    for (const side of ['left', 'right']) {
      outputs.push({
        nodeId: meter.id,
        label: `${String(meter.data.label ?? 'Stereo VU Meter')} ${side}`,
        chipset,
        leds,
        clocked: isClocked(chipset),
        micros: chipsetSendMicros(chipset, leds),
      })
    }
  }
  return outputs
}

/** Whether the sketch brings up Wi-Fi or Ethernet: the same test the generators use. */
export function sketchUsesNetwork(nodes: readonly StudioNode[]): boolean {
  return networkSourceIn(nodes) !== null
}

/**
 * RMT words an IR receiver holds in the LED outputs' pool: only where the
 * receiver captures through RMT on this family and RX shares TX memory.
 * Today the RMT capture runs only on the S3, whose RX memory is its own, so
 * this is zero on every shipped board until the adapter spreads.
 */
export function irReservedRmtWords(nodes: readonly StudioNode[], family: BuildTargetFamily, facts: LedDriverFacts): number {
  if (!facts.rmt?.sharedPool || !IR_RMT_RX_FAMILIES.includes(family)) return 0
  return nodes.some((node) => node.data.nodeType === 'IRRemoteInput') ? IR_RMT_RX_SYMBOLS : 0
}

/**
 * Clockless outputs the board's LED driver sends at once.
 *
 * The seam step 7 extends: `driver` is the Board's `ledDriver`. Only `auto`
 * (FastLED's own choice) is modelled; any other driver is read as auto until
 * its concurrency is recorded in `ledDrivers.ts`.
 */
export function ledOutputConcurrency(
  facts: LedDriverFacts,
  driver: string,
  options: { networkActive: boolean; reservedWords: number },
): number {
  void driver
  let slots = Math.max(1, facts.parallelOutputs)
  if (facts.clocklessBus === 'RMT' && facts.rmt) {
    const rmt = facts.rmt
    const singleBuffered = Math.floor(Math.max(0, rmt.txMemoryWords - options.reservedWords) / rmt.blockWords)
    const fit = options.networkActive
      ? rmtOutputsThatFit(rmt, true, options.reservedWords)
      : Math.min(rmt.txChannels, singleBuffered)
    slots = Math.min(slots, Math.max(1, fit))
  }
  return slots
}

/** Longest-first list scheduling over `slots`: when the last output finishes. */
function scheduledMicros(micros: number[], slots: number): number {
  const finish = new Array<number>(Math.max(1, slots)).fill(0)
  for (const time of [...micros].sort((a, b) => b - a)) {
    let earliest = 0
    for (let i = 1; i < finish.length; i += 1) if (finish[i] < finish[earliest]) earliest = i
    finish[earliest] += time
  }
  return Math.max(...finish)
}

/** The Board node's family and FQBN, from its selected profile. */
function boardTarget(nodes: readonly StudioNode[]): { family: BuildTargetFamily; fqbn: string } {
  const fqbn = selectedPhysicalBoardProfile(nodes)?.compatibleFqbns[0] ?? ''
  return { family: targetFamilyFromFqbn(fqbn), fqbn }
}

/**
 * One frame's wire time on the selected Board, or null when nothing is sent
 * through FastLED. Reads root-graph nodes: outputs and the Board live there.
 */
export function estimateWireTime(nodes: StudioNode[], edges: readonly StudioEdge[]): WireTimeEstimate | null {
  const outputs = wireOutputs(nodes, edges)
  if (outputs.length === 0) return null
  const { family, fqbn } = boardTarget(nodes)
  const facts = ledDriverFacts(family, fqbn)
  const board = nodes.find((node) => node.data.nodeType === 'Board')
  const driver = String((board?.data.properties as Record<string, unknown> | undefined)?.ledDriver ?? 'auto')
  const networkActive = sketchUsesNetwork(nodes)
  const reservedWords = irReservedRmtWords(nodes, family, facts)
  const concurrency = ledOutputConcurrency(facts, driver, { networkActive, reservedWords })
  const clockless = outputs.filter((output) => !output.clocked)
  const clocked = outputs.filter((output) => output.clocked)
  const estimatedMicros = (clockless.length ? scheduledMicros(clockless.map((o) => o.micros), concurrency) : 0)
    + clocked.reduce((sum, output) => sum + output.micros, 0)
  const frameRate = controllerSettings(nodes).frameRate
  const maxWireFps = Math.floor(1_000_000 / estimatedMicros)
  const reachableFps = Math.max(FRAME_RATE.min, Math.min(frameRate, maxWireFps))
  const rmt = facts.clocklessBus === 'RMT' && facts.rmt
    ? {
        wanted: Math.min(clockless.length, facts.rmt.txChannels, facts.parallelOutputs),
        fitWithNetwork: rmtOutputsThatFit(facts.rmt, true, reservedWords),
        wordsPerChannel: facts.rmt.networkBlocks * facts.rmt.blockWords,
        txMemoryWords: facts.rmt.txMemoryWords,
        reservedWords,
      }
    : null
  return {
    outputs,
    ledCount: outputs.reduce((sum, output) => sum + output.leds, 0),
    controllerCount: outputs.length,
    facts,
    family,
    driver,
    networkActive,
    concurrency,
    estimatedMicros,
    maxWireFps,
    frameRate,
    reachableFps,
    wireBound: estimatedMicros > 1_000_000 / frameRate,
    rmt,
  }
}

/** A fix the wire-time advice offers, with the sentence that describes it. */
export interface WireTimeFix extends GraphDiagnosticFix {
  text: string
}

/**
 * Every fix that applies to a wire-bound graph now, first is the button the
 * card leads with. The one place fixes are listed: a faster clock (step 5),
 * **Split across pins** (step 6) and a parallel driver (step 7) are appended
 * here when they land.
 */
export function wireTimeFixes(estimate: WireTimeEstimate): WireTimeFix[] {
  const fixes: WireTimeFix[] = []
  if (estimate.reachableFps < estimate.frameRate) {
    fixes.push({
      action: 'lower-frame-rate',
      repair: { kind: 'set-frame-rate', frameRate: estimate.reachableFps },
      text: `Lower the Board's frame rate to ${estimate.reachableFps} fps, so every frame is sent whole and on time.`,
    })
  }
  // A faster clock on each clocked LED output that has one, slowest send
  // first. VU rails have no data-rate setting.
  const seen = new Set<string>()
  for (const output of [...estimate.outputs].sort((a, b) => b.micros - a.micros)) {
    if (!output.clocked || !('dataRateMhz' in output) || seen.has(output.nodeId)) continue
    seen.add(output.nodeId)
    const faster = clockedRateFix(output.chipset, output.dataRateMhz)
    if (!faster) continue
    fixes.push({
      action: 'raise-data-rate',
      repair: { kind: 'set-data-rate', nodeId: output.nodeId, dataRateMhz: faster.toMhz },
      text: `Or clock ${output.label} at ${faster.toMhz} MHz instead of ${faster.fromMhz} MHz${output.chipset.startsWith('APA102') ? '; long APA102 runs can lose data at high rates' : ''}.`,
    })
  }
  return fixes
}

const ms = (micros: number): string => `${(micros / 1000).toFixed(1)} ms`

function sendShape(estimate: WireTimeEstimate): string {
  const count = estimate.controllerCount
  if (count === 1) return 'its one output'
  if (estimate.concurrency <= 1) return `${count} outputs sent one after another`
  return `${count} outputs, ${Math.min(estimate.concurrency, count)} at a time`
}

/**
 * Graph Health advice for a wire-bound graph, and on RMT boards with a
 * network up, for outputs that need more RMT memory than the chip has.
 * Advice only: the sketch still runs, just slower than the Board asks.
 */
export function wireTimeAdvice(estimate: WireTimeEstimate | null): GraphDiagnostic[] {
  if (!estimate) return []
  const issues: GraphDiagnostic[] = []
  const nodeIds = [...new Set(estimate.outputs.map((output) => output.nodeId))]
  if (estimate.wireBound) {
    const fixes = wireTimeFixes(estimate)
    const [lead, ...more] = fixes
    issues.push({
      id: 'wire-time-frame-rate', severity: 'warning', category: 'board',
      title: `The LEDs reach about ${estimate.reachableFps} fps, not ${estimate.frameRate}`,
      message: `Sending ${estimate.ledCount} LEDs (${sendShape(estimate)}) takes about ${ms(estimate.estimatedMicros)} on the ${estimate.facts.chip}, longer than the ${ms(1_000_000 / estimate.frameRate)} a frame has at ${estimate.frameRate} fps. The wire, not the pattern, sets the pace.`,
      fix: fixes.map((fix) => fix.text).join(' '),
      nodeIds,
      ...(lead ? { action: lead.action, repair: lead.repair } : {}),
      ...(more.length ? { moreFixes: more.map(({ action, repair }) => ({ action, repair })) } : {}),
    })
  }
  const rmt = estimate.rmt
  if (rmt && estimate.networkActive && rmt.wanted > Math.max(1, rmt.fitWithNetwork)) {
    const sendsAtOnce = Math.max(1, rmt.fitWithNetwork)
    const pool = rmt.reservedWords > 0
      ? `${rmt.txMemoryWords - rmt.reservedWords} of its ${rmt.txMemoryWords} words once the IR receiver takes ${rmt.reservedWords}`
      : `${rmt.txMemoryWords} words`
    issues.push({
      id: 'wire-time-rmt-network', severity: 'warning', category: 'board',
      title: 'With the network up, these outputs take turns',
      message: `With Wi-Fi or Ethernet running, FastLED gives each RMT output ${rmt.wordsPerChannel} words so network interrupts cannot starve it. ${rmt.wanted} outputs would need ${rmt.wanted * rmt.wordsPerChannel}, and the ${estimate.facts.chip} has ${pool}, so it sends ${sendsAtOnce === 1 ? 'one at a time' : `${sendsAtOnce} at a time`}. The frame-rate estimate already counts this.`,
      fix: 'Nothing to change if the frame rate is enough. Otherwise use fewer, longer outputs, or drop the network from this sketch.',
      nodeIds,
    })
  }
  return issues
}
