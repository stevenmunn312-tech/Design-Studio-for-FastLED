/*
 * What a node's firmware emitter can read and write while generateCpp builds
 * one sketch. Each category's emitters live in src/nodes/<category>/codegen.ts,
 * beside the same nodes' previews; generateCpp builds the sketch half of this
 * once, adds the per-node half for every node it emits, and dispatches by type.
 */
import type { StudioNode, StudioEdge } from '../state/graphStore'
import type { TransportArtworks } from '../utils/transportArtworks'
import type { DisplayDocumentRegistry } from '../state/displayDocument'
import type { BakedCustomDisplayAsset } from '../state/customDisplayResources'
import type { OutputRoute } from '../state/outputRouting'
import type { LedHardware } from './ledHardwareCpp'
import type { Hub75Hardware } from './hub75Cpp'
import type { PlayerControlButtonEmit } from './playerControlsCpp'
import type { StereoVuEmit } from './stereoVuMeterCpp'
import type { IrRemoteProjectNode } from './irRemoteCpp'
import type { SegmentDisplayEmit } from './segmentDisplayCpp'
import type { InfoDisplayEmit } from './infoDisplayCpp'
import type { TftDisplayEmit } from './tftDisplayCpp'
import type { TftTouchEmit } from './tftTouchCpp'
import type { CustomDisplayLvglEmit } from './customDisplayLvglCpp'
import type { CustomDisplayPanelEmit } from './customDisplayPanelCpp'

/**
 * `externalAudio`: the host sketch already provides the audio-engine globals
 * (used when compiling a pattern subgraph into a controller that hosts the
 * engine), so FFTAnalyzer/BeatDetect reference them without re-emitting it.
 * `psramAllowed`: gate for the Board `usePsram` property — the upload UI
 * passes false when the selected board has no PSRAM support, so a stale
 * toggle can't emit ESP32-only allocation calls into an AVR/RP2040 sketch.
 * `aliasTerminalBuffer`: let the node feeding the single LED output render
 * straight into `leds` instead of into its own buffer that is then copied
 * over wholesale. Safe only when this sketch is the sole writer of `leds` —
 * a pattern-show body is not (every pattern renders through the same `leds`,
 * and a persistent-buffer node such as Trails would be clobbered by the other
 * pattern mid-transition), so showGenerator passes false.
 * `artworks`: a Pattern Browser cannot occur here: it is the Slideshow's
 * screen, and a Slideshow builds the show controller. So no thumbnail table,
 * no selection cursor, and no flash spent on either. Handed in rather than
 * baked here — baking evaluates patterns, and a text emitter has no business
 * doing that, nor any way to know whether the workspace has been trusted. See
 * utils/browserThumbnails.ts.
 * `displayDocuments`: the screen design a panel names (widgets, bounds,
 * theme) is not on the node — the node carries only its persisted ports and
 * physical/pin properties — so it has to be handed in, keyed by displayId, the
 * same way artworks is. `customDisplayAssets`: the finished per-widget PROGMEM
 * bytes, keyed by node id. Upload/export and capacity checks prepare these
 * through useCustomDisplayAssets before generating. Low-level callers may omit
 * them to preview an incomplete document.
 */
export interface GenerateCppOptions {
  externalAudio?: boolean
  nativeFastLedAudio?: boolean
  groupInputExprs?: Record<string, string>
  psramAllowed?: boolean
  aliasTerminalBuffer?: boolean
  artworks?: TransportArtworks
  bootLabel?: string
  displayDocuments?: DisplayDocumentRegistry
  customDisplayAssets?: Record<string, readonly BakedCustomDisplayAsset[]>
}

/** One leading LED output run, with everything its setup and blit need. */
export interface OutputEmitConfig extends OutputRoute {
  safeId: string
  dataPin: number
  hardware: LedHardware
  xyTable: number[] | null
  /** Physical LEDs on this route: a panel's grid, or a chain's length. */
  ledTotal: number
  passIndex: number
  renderWidth: number
  renderHeight: number
  ringMap: number[] | null
  corkscrewMap: number[] | null
}

/** A set-once flag an emitter raises to pull a helper into the sketch. */
export interface Need { v: boolean }

/** The sketch being generated: its graph, its hardware, and what emitters collect into it. */
export interface SketchEmitContext {
  nodes: StudioNode[]
  edges: StudioEdge[]
  opts: GenerateCppOptions
  bootTitle: string
  bootDevice: string
  incoming: Map<string, { srcId: string; srcPort: string }>
  nodeMap: Map<string, StudioNode>
  /** The output this one mirrors off the same pin, or null for a leader. */
  isMirrorOf: (node: StudioNode) => string | null
  multipleOutputs: boolean
  intProp: (val: unknown, def: number, min: number, max: number) => number
  nativeMultiRender: boolean
  width: number
  height: number
  /** A node's properties with scalar expressions resolved at render size. */
  props: (n: StudioNode) => Record<string, unknown>
  hw: LedHardware
  isHub75: boolean
  hub75Hw: Hub75Hardware | null
  xyTable: number[] | null
  ss: boolean
  ringMap: number[] | null
  corkscrewMap: number[] | null
  physLeds: 'RING_LEDS' | 'CORKSCREW_LEDS' | 'PANEL_LEDS' | 'NUM_LEDS'
  outputConfigs: OutputEmitConfig[]
  nativeFastLedAudio: boolean
  hasExplicitAudioInput: (nodeId: string) => boolean
  aliasedTerminalId: string | null
  floatExpr: (nodeId: string, portId: string, nodeProps: Record<string, unknown>, propKey: string, def: number) => string
  pressButton: (nodeId: string, port: string, repeat: boolean) => PlayerControlButtonEmit
  boolExpr: (nodeId: string, portId: string) => string
  colorExpr: (nodeId: string, portId: string, fallback?: string) => string
  fastledPalette: (name: string) => string
  paletteExpr: (nodeId: string, portId: string, nodeProps: Record<string, unknown>) => string
  stereoVuMeters: StereoVuEmit[]
  loopLines: string[]
  customDisplaySamples: string[]
  customDisplayPublication: string[]
  pinSetupLines: Set<string>
  irNodes: IrRemoteProjectNode[]
  setupLines: string[]
  globalLines: string[]
  needsMapFloat: boolean[]
  needsWorley: Need
  need3d: Need
  needsKelvin: Need
  needsT: Need
  needsShims: Need
  needsPhi: Need
  needsDisplayText: { number: boolean; dateTime: boolean }
  segmentDisplays: SegmentDisplayEmit[]
  infoDisplays: InfoDisplayEmit[]
  tftDisplays: TftDisplayEmit[]
  playerControlNodes: string[]
  ledLatchOutputs: string[]
  tftTouches: TftTouchEmit[]
  emitTelemetry: boolean
  customDisplays: CustomDisplayLvglEmit[]
  customDisplayPanels: CustomDisplayPanelEmit[]
  needsXyMap: Need
  frameBufs: Set<string>
  feedbackHistoryBufs: Map<string, number>
  persistentFrameStateBufs: Set<string>
  customDisplayOwners: Set<string>
}

/** The node being emitted and the helpers bound to it. */
export interface NodeEmitContext {
  node: StudioNode
  /** The node id made safe for a C++ identifier. */
  id: string
  /** Its properties, scalar expressions resolved. */
  p: Record<string, unknown>
  type: string
  /** Append one line to loop(). */
  ln: (line: string) => void
  /** This node's variable for an output port: `n_<id>_<port>`. */
  v: (port: string) => string
  /** A float input: the wire's expression, else the property's literal. */
  f: (port: string, pk: string, def: number) => string
  /** A colour whose channels can each carry a wire. */
  channelColor: (port: string | null, dr: number, dg: number, db: number, keys?: readonly [string, string, string]) => string
  /** One channel of a linear A-to-B mix, rounded as the evaluator rounds it. */
  gradientChannel: (a: string, b: string, channel: string, t: string) => string
  /** This node's own frame buffer, declared on first use. */
  ownBuf: () => string
  /** The buffer of the node feeding `port`, or null if unconnected. */
  srcBuf: (port: string) => string | null
  /** An LED output's blackout and dimming expressions. */
  outputRuntimeEmit: (target: StudioNode, array: string, count: string) => {
    id: string; array: string; count: string; enabledExpr: string | null; brightnessExpr: string | null
  }
  /** What a status panel draws about the LED output wired into it. */
  ledStatusEmit: (source: StudioNode | null | undefined) => {
    name: string; formLabel: string; ledCount: number; enabledExpr: string; brightnessExpr: string
  } | undefined
  /** A statement that seeds this node's buffer from a frame input, or black. */
  seedFrom: (port: string) => string
  /** This node's own float field buffer. */
  ownField: () => string
  /** The field buffer of the node feeding `port`, or null if unconnected. */
  srcField: (port: string) => string | null
}

export type EmitContext = SketchEmitContext & NodeEmitContext

/** One node type's firmware: appends its declarations and loop lines to the sketch. */
export type NodeEmitter = (ctx: EmitContext) => void
export type NodeEmitters = Record<string, NodeEmitter>
