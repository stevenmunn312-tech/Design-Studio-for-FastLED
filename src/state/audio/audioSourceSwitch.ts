// The one definition of the Audio node's runtime source switch.
//
// The body's Source menu picks a source at design time. Its Source input
// changes it while the board runs: a press (a Button, an IR key, a Web Remote
// button, an Encoder's Pressed) steps to the next source, and a number (an
// Encoder's Position or Level, a Web Remote slider) picks one by position,
// as Palette Bank's Index does. Only the sources whose hardware is on the bench
// take part, in the body's menu order, so the preview, the Checks and the
// sketch all cycle through the same list.
//
// Everything here is pure, like `transportBridge.ts`: state is passed in and
// mutated in place, so the preview's handler and the generators share the
// rules and the numbers.
import type { StudioEdge, StudioNode } from '../graphStore'
import { outputPortDataType } from '../../build/boardLinks'
import {
  audioCapabilitySources,
  graphAudioCapabilitySource,
  resolveAudioCapabilitySource,
  type AudioCapabilityKind,
  type AudioCapabilitySource,
} from './audioCapabilities'
import {
  blankButtonEdgeState,
  buttonEdge,
  DEFAULT_BUTTON_EDGE_SETTINGS,
  type ButtonEdgeState,
} from '../player/transportBridge'
import { pressEdgeSettings } from '../player/pressSource'

/** The Audio node's runtime input. */
export const AUDIO_SOURCE_INPUT = 'source'

/** The source kinds in the order the switch cycles through them: the menu's. */
const SWITCH_ORDER: readonly AudioCapabilityKind[] = ['microphone', 'line-in', 'decoder']

/** What each source is called wherever the switch is described. */
export const AUDIO_SOURCE_LABELS: Record<AudioCapabilityKind, string> = {
  microphone: 'Microphone',
  'line-in': 'Line Input',
  decoder: 'Audio Decoder',
}

/**
 * The sources a Source input cycles through: one per kind whose hardware is
 * on the bench, in menu order. A decoder counts only where the Music Player
 * has music and an amplifier, as the menu already decides.
 */
export function audioSwitchSources(nodes: readonly StudioNode[]): AudioCapabilitySource[] {
  const sources = audioCapabilitySources(nodes)
  return SWITCH_ORDER.flatMap((kind) => sources.find((source) => source.kind === kind) ?? [])
}

/** The wire into an Audio node's Source input, if any. */
export function audioSourceWire(
  audioNodeId: string, edges: readonly StudioEdge[],
): StudioEdge | undefined {
  return edges.find((edge) => edge.target === audioNodeId && edge.targetHandle === AUDIO_SOURCE_INPUT)
}

/**
 * How the wired value drives the switch. A switch (bool) output is a press:
 * each one steps on. Anything else is a number that picks a position.
 */
export type AudioSourceDrive = 'press' | 'position'

export function audioSourceDrive(
  source: StudioNode | undefined, sourceHandle: string | null | undefined,
): AudioSourceDrive {
  return source && outputPortDataType(source, sourceHandle) === 'bool' ? 'press' : 'position'
}

/**
 * The root graph's Audio node and its switch, when the Source input is wired.
 * `sources` is empty when nothing on the bench can be switched to.
 */
export interface AudioSourceSwitch {
  audioNode: StudioNode
  wire: StudioEdge
  drive: AudioSourceDrive
  sources: AudioCapabilitySource[]
  /** Where the switch starts: the body's choice when it is on the bench, else the first. */
  startIndex: number
}

export function audioSourceSwitchFor(
  nodes: readonly StudioNode[],
  edges: readonly StudioEdge[],
  capabilityNodes: readonly StudioNode[] = nodes,
): AudioSourceSwitch | null {
  const audioNode = nodes.find((node) => node.data.nodeType === 'Audio')
  if (!audioNode) return null
  const wire = audioSourceWire(audioNode.id, edges)
  if (!wire) return null
  const source = nodes.find((node) => node.id === wire.source)
  const sources = audioSwitchSources(capabilityNodes)
  return {
    audioNode,
    wire,
    drive: audioSourceDrive(source, wire.sourceHandle),
    sources,
    startIndex: audioSourceStartIndex(sources, capabilityNodes, audioNode.data.properties.sourceId),
  }
}

export function audioSourceStartIndex(
  sources: readonly AudioCapabilitySource[],
  capabilityNodes: readonly StudioNode[],
  sourceId: unknown,
): number {
  const chosen = resolveAudioCapabilitySource(capabilityNodes, sourceId)
  const index = chosen ? sources.findIndex((source) => source.kind === chosen.kind) : -1
  return Math.max(0, index)
}

/**
 * A number as the position it picks: rounded half up, as `Math.round` and the
 * sketch's `floorf(x + 0.5f)` both round, then wrapped round the list, so an
 * Encoder's Position steps one source per click in either direction and a
 * Level below one half picks the first source and above it the second. A wire
 * carrying anything that is not a number picks the first.
 */
export function audioSourcePosition(value: number, count: number): number {
  if (count <= 0) return 0
  const whole = Number.isFinite(value) ? Math.round(value) || 0 : 0
  const wrapped = whole % count
  return wrapped < 0 ? wrapped + count : wrapped || 0
}

/** The position's C++: the same whole number, wrapped, as an int. */
export function audioSourcePositionCpp(value: string, count: number): string {
  return `_audioSourcePosition(${value}, ${count})`
}

export const AUDIO_SOURCE_POSITION_CPP = [
  '// A number picks a source by position: rounded half up and wrapped round',
  '// the list (state/audio/audioSourceSwitch.ts).',
  'static int _audioSourcePosition(float value, int count) {',
  '  if (count <= 0 || !isfinite(value)) return 0;',
  '  long whole = (long)floorf(value + 0.5f) % count;',
  '  return (int)(whole < 0 ? whole + count : whole);',
  '}',
]

/** The switch's per-node state in the preview. */
export interface AudioSourceSwitchState {
  index: number
  /** The last position a number wire picked; a change selects it. */
  chosen?: number
  press: ButtonEdgeState
}

export function blankAudioSourceSwitchState(startIndex: number, nowMs: number): AudioSourceSwitchState {
  return { index: startIndex, press: blankButtonEdgeState(nowMs) }
}

/**
 * Advance the switch one pass. A press steps on once per press, debounced as a
 * transport button is when it comes from a contact, and never repeats while
 * held: holding a button down is still one change of source. A number selects
 * whenever its position changes, and on the first pass, so the wire decides
 * where the switch starts.
 */
export function stepAudioSourceSwitch(
  state: AudioSourceSwitchState,
  drive: AudioSourceDrive,
  value: number | boolean,
  count: number,
  nowMs: number,
  pressSourceType?: string,
): number {
  if (count <= 0) {
    state.index = 0
    return 0
  }
  if (state.index >= count || state.index < 0) state.index = 0
  if (drive === 'press') {
    const pressed = typeof value === 'boolean' ? value : Number(value) >= 0.5
    if (buttonEdge(state.press, pressed, nowMs, false, audioSourcePressSettings(pressSourceType))) {
      state.index = (state.index + 1) % count
    }
    return state.index
  }
  const position = audioSourcePosition(Number(value), count)
  if (state.chosen !== position) {
    state.chosen = position
    state.index = position
  }
  return state.index
}

/** The debounce a press into the switch takes: a contact's, or none for a computed pulse. */
export function audioSourcePressSettings(sourceType: string | undefined) {
  return pressEdgeSettings(DEFAULT_BUTTON_EDGE_SETTINGS, sourceType)
}

/** "Microphone · Audio Decoder": the list the body and the Checks name. */
export function audioSwitchSummary(sources: readonly AudioCapabilitySource[]): string {
  return sources.map((source) => AUDIO_SOURCE_LABELS[source.kind]).join(' · ')
}

/**
 * The capture part the browser keeps listening through: the body's choice, or
 * while a Source switch is wired, the first microphone or line input it can
 * switch to, so switching to it is instant rather than a fresh permission ask.
 */
export function previewCaptureSource(
  nodes: readonly StudioNode[], edges: readonly StudioEdge[],
): AudioCapabilitySource | null {
  const chosen = graphAudioCapabilitySource(nodes)
  if (chosen && chosen.kind !== 'decoder') return chosen
  const switched = audioSourceSwitchFor(nodes, edges)
  return switched?.sources.find((source) => source.kind !== 'decoder') ?? null
}

/**
 * How many I2S controllers an ESP32 family has. Every source but the internal
 * DAC holds one: a microphone or line input receives on its own, and the
 * decoder transmits to the amplifier on I2S0. Undefined off the ESP32 family,
 * where only one source can exist anyway.
 */
export function esp32I2sPortCount(fqbn: string | undefined): number | undefined {
  if (!fqbn?.startsWith('esp32:esp32:')) return undefined
  const chip = fqbn.slice('esp32:esp32:'.length)
  if (chip.startsWith('esp32s3')) return 2
  if (chip.startsWith('esp32p4')) return 3
  if (/^esp32(?:s2|c\d|h\d)/.test(chip)) return 1
  return 2
}

/** One thing the switch cannot do on this graph, as Checks and the body say it. */
export interface AudioSwitchProblem {
  severity: 'error' | 'warning'
  message: string
}

/**
 * What stops the wired Source switch working as drawn. `buildMode` is the
 * graph's resolved firmware path: a single-board sketch and the Music Player
 * build host the switch; a slideshow and a Performance show listen to one
 * source. `fqbn` and `boardLabel` name the selected board, when there is one.
 */
export function audioSwitchProblems(
  sw: AudioSourceSwitch,
  options: { buildMode: 'sketch' | 'show' | 'player' | 'performance'; fqbn?: string; boardLabel?: string },
): AudioSwitchProblem[] {
  const problems: AudioSwitchProblem[] = []
  const names = audioSwitchSummary(sw.sources)
  if (sw.sources.length < 2) {
    problems.push({
      severity: 'warning',
      message: sw.sources.length === 0
        ? 'Audio: Source switches between the audio sources on the bench, but none is there yet. Add a Microphone or Line In part, or a Music Player with music and an amplifier.'
        : `Audio: Source switches between the audio sources on the bench, but only the ${names} is there. Add a Microphone or Line In part, or a Music Player with music and an amplifier, to switch to.`,
    })
    return problems
  }
  if (options.buildMode === 'show' || options.buildMode === 'performance') {
    const start = AUDIO_SOURCE_LABELS[sw.sources[sw.startIndex]?.kind ?? sw.sources[0].kind]
    problems.push({
      severity: 'warning',
      message: `Audio: Source switching runs in a single-board sketch or a Music Player build. This ${options.buildMode === 'show' ? 'slideshow' : 'Performance show'} listens to the ${start} only.`,
    })
  }
  const ports = esp32I2sPortCount(options.fqbn)
  if (ports !== undefined && sw.sources.length > ports) {
    problems.push({
      severity: 'error',
      message: ports === 1
        ? `Audio: the ${options.boardLabel ?? 'selected board'} has one I2S port, so the ${names.replace(/ · /g, ' and the ')} cannot run at once. Switch between them on an ESP32 or ESP32-S3, which have two.`
        : `Audio: the ${options.boardLabel ?? 'selected board'} has ${ports} I2S ports, and the ${names.replace(/ · /g, ', the ')} need ${sw.sources.length}. Remove one of them from the bench to switch between the others.`,
    })
  }
  return problems
}
