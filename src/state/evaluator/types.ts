import type { DmxSnapshot } from '../peripherals/dmx'
import type { RtcPreview } from '../peripherals/rtc'
import type { SegmentFrame } from '../displays/segmentDisplay'
import type { OledSurface } from '../displays/oledSurface'
import type { TftSurface } from '../displays/tftSurface'
import type { StudioNode, StudioEdge } from '../graphStore'
import type { DisplaySignal } from '../displays/displaySignal'
import type { PatternSelectValue } from '../patterns/patternSelection'
import type { ImagePaletteSource } from '../palettes/imagePalette'
import type { RGB, Frame, Palette } from '../palettes/ledColor'
import type { StereoVuFrame } from '../audio/stereoVuMeter'

/** A per-pixel scalar grid, length W×H (row-major, index y*W+x), values 0–1. */
export type Field = Float32Array

/** The value carried by an Audio cable. Analysis nodes consume this payload;
 * only source nodes are allowed to sample the browser audio engine. */
/** Self-normalising MilkDrop levels from FastLED's Vibe detector. Levels sit
 * near 1.0 at the song's running average and are unbounded above; the spikes
 * are true while the immediate level exceeds the smoothed one. */
export interface VibeSignal {
  bass: number
  mid: number
  treble: number
  volume: number
  bassAtt: number
  midAtt: number
  trebleAtt: number
  bassSpike: boolean
  midSpike: boolean
  trebleSpike: boolean
}

/** Song-structure events from FastLED's downbeat, buildup, drop, mood and tempo
 * detectors. `downbeat` and `drop` are true only on the frame they fire. */
export interface SongStructureSignal {
  downbeat: boolean
  beatNumber: number
  measurePhase: number
  building: boolean
  buildupProgress: number
  drop: boolean
  dropImpact: number
  tempoStable: boolean
  valence: number
  arousal: number
}

/** Pitch, note and key from the Pitch Detect node's detectors. `noteOn` is true
 * only on the frame a note starts or changes. */
export interface PitchSignal {
  hz: number
  note: number
  noteOn: boolean
  velocity: number
  confidence: number
  keyRoot: number
  keyMinor: boolean
  keyConfidence: number
}

export interface AudioSignal {
  active: boolean
  micActive: boolean
  nativeFastLed?: boolean
  beat?: boolean
  bpm?: number
  bass?: number
  mids?: number
  treble?: number
  micBass: number
  micMids: number
  micTreble: number
  spectrum: number[]
  detectorSpectrum: number[]
  previewSpectrum?: number[]
  /** Lightweight channel RMS for stereo VU fixtures. Missing fields are a
   * legacy/mono payload and resolve through audio/stereoLevels.ts. */
  leftLevel?: number
  rightLevel?: number
  channelCount?: 1 | 2
  /** Absent on legacy, baked and recorded payloads from before the detector
   * existed; every reader treats a missing field as inactive. */
  vibe?: VibeSignal
  /** Absent on payloads from before the detector existed: inactive. */
  structure?: SongStructureSignal
  /** Absent on payloads from before the detector existed: inactive. */
  pitch?: PitchSignal
  /** 128 conditioned samples, -1..1, peak-decimated from the analysed chunk.
   * Absent on payloads from before Waveform existed: read as silence. */
  samples?: readonly number[]
}

/** Provider identity carried by the Storage capability port. */
export interface StorageSignal {
  id: string
  kind: 'sd' | 'flash' | 'usb'
  label: string
}

/** Semantic commands and values carried by a Control Map cable. Command
 * booleans are one-evaluation pulses. Absolute controls are omitted when no
 * local or chained absolute source exists; deltas accumulate across chains. */
export interface PlayerControls {
  playPause: boolean
  previous: boolean
  next: boolean
  volume?: number
  volumeDelta: number
  ledToggle: boolean
  brightness?: number
  brightnessDelta: number
  /**
   * Master Speed, when a control has been given that job.
   *
   * Absent rather than 1 when nobody is driving it, so an unwired bundle
   * cannot quietly overrule the node's own slider — the same reason `volume`
   * and `brightness` are optional.
   */
  speed?: number
  /**
   * Pattern-selection intent, from Control Map.
   *
   * `patternSteps` is whole detents already — the encoder's running count is
   * turned into steps where the encoder is read, so the player receives a
   * decision rather than a raw reading and cannot disagree with the panel
   * about what a click was.
   */
  patternSteps: number
  patternConfirm: boolean
}

/** Beat-particle appearance carried independently of a rendered frame. */
export interface PlayerParticles {
  enabled: boolean
  style: number
  color: RGB
  intensity: number
  randomColor: boolean
  randomStyle: boolean
}

export type PortValue = number | boolean | string | string[] | RGB | RGB[] | Frame | Field | ImagePaletteSource | DmxSnapshot | RtcPreview | AudioSignal | StorageSignal | PlayerControls | PlayerParticles | SegmentFrame | OledSurface | TftSurface | PatternSelectValue | DisplaySignal | StereoVuFrame | null

/** A reusable pattern group: a named subgraph that a `Group` node evaluates. */
export interface GroupDef { nodes: StudioNode[]; edges: StudioEdge[] }
export type GroupRegistry = Record<string, GroupDef>

/** Audio values supplied while rendering a recorded preview or baked show. The
 * override enters through an Audio/Microphone/GroupInput source, never by
 * making an unwired analysis node ambiently connected. */
export type AudioOverride = AudioSignal

/** `evaluateGraph`'s signature, handed to nodes that render a subgraph. */
export type EvaluateGraph = (
  nodes: StudioNode[],
  edges: StudioEdge[],
  tick: number,
  gridW?: number,
  gridH?: number,
  groups?: GroupRegistry,
  instancePrefix?: string,
  groupStack?: ReadonlySet<string>,
  groupInputs?: Record<string, PortValue>,
  audioOverride?: AudioOverride | null,
  trusted?: boolean,
  capabilityNodes?: readonly StudioNode[],
  elapsedTick?: number,
) => Frame | null

/**
 * One evaluation pass: a graph (or one group instance) at one tick. Built
 * once per pass and shared by every node the pass evaluates.
 */
export interface EvalContext {
  nodes: StudioNode[]
  edges: StudioEdge[]
  /** The animation clock, which Master Speed scales, in ticks and seconds. */
  tick: number
  t: number
  /** Unscaled wall-clock time, for schedulers that must not follow Master Speed. */
  elapsedTick: number
  elapsedT: number
  W: number
  H: number
  groups: GroupRegistry
  /** Namespaces stateful nodes per group instance. */
  instancePrefix: string
  /** Groups being evaluated above this pass, to break recursion. */
  groupStack: ReadonlySet<string>
  /** Values bound to the current group's exposed parameters. */
  groupInputs: Record<string, PortValue>
  /** Recorded or show audio injected at a source or group boundary. */
  audioOverride: AudioOverride | null
  /** Whether formula and Code nodes may run their preview logic. */
  trusted: boolean
  /** Root hardware, authoritative even inside a nested group. */
  capabilityNodes: readonly StudioNode[]
  nodeMap: Map<string, StudioNode>
  /** "targetNodeId:targetPortId" → the upstream output wired into it. */
  incoming: Map<string, { srcId: string; srcPort: string }>
  /** One input's value: the wired upstream output, else `fallback`. */
  input: (nodeId: string, portId: string, fallback: PortValue) => PortValue
  /** A numeric input: the wire, else the property, clamped when the node asks. */
  num: (nodeId: string, portId: string, props: Record<string, unknown>, propKey: string, def?: number) => number
  /** A palette input: the wired palette, else the property's preset name. */
  pal: (nodeId: string, portId: string, props: Record<string, unknown>, propKey: string, def: string) => Palette
  /** A node's persistent-state key, marked live for the idle sweep. */
  stateKey: (id: string) => string
  evaluateGraph: EvaluateGraph
}

/** One node type's preview: its output ports for this pass. */
export type NodeEvaluator = (
  ctx: EvalContext,
  id: string,
  props: Record<string, unknown>,
  node: StudioNode,
  type: string,
) => Record<string, PortValue>

export type NodeEvaluators = Record<string, NodeEvaluator>
