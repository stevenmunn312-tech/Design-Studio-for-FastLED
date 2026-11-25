// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest'
import type { StudioEdge, StudioNode } from '../../../state/graphStore'
import { resetEvaluatorState, type Frame } from '../../../state/graphEvaluator'
import { NODE_LIBRARY } from '../../../state/nodeLibrary'
import { outputRoutes } from '../../../state/output/outputRouting'
import { STARTER_TEMPLATES } from '../../../state/patterns/starterTemplates'
import { consumeLiveBeats } from '../../../state/audio/liveAudioSignal'
import { blankDmxSnapshot } from '../../../state/peripherals/dmx'
import { EVALUATOR_STORES } from '../evaluatorStores'
import { evaluatePreviewPasses, selectPreviewRoute } from '../previewEvaluation'
import {
  createPreviewWorkerHandler, plainData, snapshotLiveState, unpackFrame, unpackPorts,
  type PreviewLiveState, type PreviewWorkerRequest,
} from '../previewWorker'

function node(id: string, nodeType: string, props: Record<string, unknown> = {}): StudioNode {
  const def = NODE_LIBRARY.find((n) => n.type === nodeType)
  return {
    id,
    type: 'studioNode',
    position: { x: 0, y: 0 },
    data: {
      label: nodeType, nodeType, category: def?.category ?? '', properties: { ...(def?.defaultProperties ?? {}), ...props },
      inputs: def?.inputs ?? [], outputs: def?.outputs ?? [],
    },
  } as unknown as StudioNode
}

function edge(source: string, sourceHandle: string, target: string, targetHandle: string): StudioEdge {
  return { id: `${source}->${target}:${targetHandle}`, source, target, sourceHandle, targetHandle } as unknown as StudioEdge
}

function withOutput(nodes: StudioNode[], props: Record<string, unknown>): StudioNode[] {
  return nodes.map((entry) => entry.data.nodeType === 'MatrixOutput'
    ? { ...entry, data: { ...entry.data, properties: { ...entry.data.properties, ...props } } }
    : entry)
}

interface Step {
  nodes: StudioNode[]
  edges: StudioEdge[]
  tick: number
  fullPass: boolean
  /** Live state for this step, by store name, set before it runs. */
  stores?: Record<string, Record<string, unknown>>
}

const copy = (frame: Frame | null) => frame?.map((row) => row.map((p) => ({ ...p }))) ?? null

/** A port value as it reads once the pass is over and has crossed a thread. */
function settled(value: unknown): unknown {
  if (Array.isArray(value) && Array.isArray(value[0])) return copy(value as Frame)
  // A pooled field is reused two passes on: keep its values now.
  if (value instanceof Float32Array) return value.slice()
  // An Audio node publishes its store's state; the worker sends the data.
  if (value && typeof value === 'object' && Object.values(value).some((entry) => typeof entry === 'function')) return plainData(value)
  return value
}

/** Every live store as it starts: no audio, no input, nothing heard. */
const QUIET = snapshotLiveState()
const storeNamed = (name: string) => EVALUATOR_STORES.find(([entry]) => entry === name)![1]
function quieten(): void {
  for (const [name, data] of Object.entries(QUIET)) storeNamed(name).setState(data)
}

/** Every step on this thread, as the loop evaluates without the worker,
 *  with the live state each step read, for the worker run to be sent. */
function onMainThread(steps: Step[]) {
  resetEvaluatorState()
  quieten()
  const buffers = { selected: null as Frame | null, stream: null as Frame | null }
  const live: PreviewLiveState[] = []
  const results = steps.map(({ nodes, edges, tick, fullPass, stores }) => {
    for (const [name, data] of Object.entries(stores ?? {})) storeNamed(name).setState(data)
    live.push(snapshotLiveState())
    const routes = outputRoutes(nodes)
    const selected = selectPreviewRoute(routes, '')
    const result = evaluatePreviewPasses({
      nodes, edges, groups: {}, trusted: true, groupInputs: undefined,
      tick, elapsedTick: tick, gridW: 16, gridH: 16, fullPass, streamOutputId: undefined,
    }, selected, buffers)
    consumeLiveBeats()
    const shown = selected ? result.routedByOutput.get(selected.id) ?? null : null
    if (shown) buffers.selected = shown
    return {
      shown: copy(shown),
      terminal: copy(result.terminalFrame),
      sawBeat: result.sawBeat,
      outputs: fullPass || result.sawBeat
        ? [...result.outputs].map(([id, ports]) => [id, Object.fromEntries(
            Object.entries(ports).map(([port, value]) => [port, settled(value)]),
          )])
        : null,
    }
  })
  quieten()
  return { results, live }
}

/** The same steps through the worker's handler, sending changes as the
 *  client does. This thread's stores stay silent: the live state reaches the
 *  handler only through what each request carries, as in the worker. */
function inWorker(steps: Step[], live: PreviewLiveState[]) {
  resetEvaluatorState()
  quieten()
  const handle = createPreviewWorkerHandler()
  let sentNodes = new Map<string, StudioNode>()
  let lastNodes: StudioNode[] | null = null
  let lastEdges: StudioEdge[] | null = null
  let returned: ArrayBuffer[] = []
  return steps.map(({ nodes, edges, tick, fullPass }, index) => {
    const request: PreviewWorkerRequest = {
      trusted: true, tick, elapsedTick: tick, gridW: 16, gridH: 16, fullPass,
      selectedRouteId: '', streamOutputId: undefined, returned,
      live: live[index], openGroupAudioKind: null,
    }
    if (nodes !== lastNodes) {
      request.nodes = { order: nodes.map((n) => n.id), changed: nodes.filter((n) => sentNodes.get(n.id) !== n) }
      sentNodes = new Map(nodes.map((n) => [n.id, n]))
      lastNodes = nodes
    }
    if (edges !== lastEdges) { request.edges = edges; lastEdges = edges }
    // Through structured clone, as postMessage sends it.
    const response = structuredClone(handle(structuredClone(request)))
    // What the worker's own stores held is not this thread's business.
    quieten()
    expect(response.error).toBeUndefined()
    const selected = selectPreviewRoute(outputRoutes(nodes), '')
    const packed = response.routed.find(([id]) => id === selected?.id)?.[1] ?? null
    returned = response.routed.flatMap(([, p]) => (p ? [p.data.buffer as ArrayBuffer] : []))
    return {
      shown: packed ? unpackFrame(packed, null) : null,
      terminal: response.terminal ? unpackFrame(response.terminal, null) : null,
      sawBeat: response.sawBeat,
      outputs: response.outputs ? response.outputs.map(([id, ports]) => [id, unpackPorts(ports)]) : null,
    }
  })
}

function bothThreads(steps: Step[]) {
  const main = onMainThread(steps)
  return { main: main.results, worker: inWorker(steps, main.live) }
}

beforeEach(() => resetEvaluatorState())

describe('preview worker', () => {
  it('shows what the main thread shows for Field Transform at 2x smooth, through an edit', () => {
    const starter = STARTER_TEMPLATES.find((entry) => entry.id === 'field-warp')!.build()
    const nodes = withOutput(starter.nodes, { width: 16, height: 16, renderResolution: '2x smooth' })
    // A Strength change replaces one node object, as the store does.
    const edited = nodes.map((entry) => entry.data.nodeType === 'FieldTransform'
      ? { ...entry, data: { ...entry.data, properties: { ...entry.data.properties, strength: 0.4 } } }
      : entry)
    const steps: Step[] = [1, 2, 3, 4, 5, 6].map((tick) => ({
      nodes: tick < 4 ? nodes : edited, edges: starter.edges, tick: tick * 1.5, fullPass: tick % 3 === 0,
    }))
    const { main, worker } = bothThreads(steps)
    expect(main[0].shown?.length).toBeGreaterThan(0)
    expect(worker).toEqual(main)
  })

  it('carries a stateful chain the same way, a pass at a time', () => {
    // A seed, so its sparks are the same on both runs (0 draws from Math.random).
    const nodes = [node('fire', 'Fire', { seed: 7 }), node('trails', 'Trails'), node('out', 'MatrixOutput', { width: 12, height: 10 })]
    const edges = [edge('fire', 'frame', 'trails', 'frame'), edge('trails', 'frame', 'out', 'frame')]
    const steps: Step[] = Array.from({ length: 8 }, (_, i) => ({ nodes, edges, tick: i + 1, fullPass: i === 7 }))
    const { main, worker } = bothThreads(steps)
    expect(worker).toEqual(main)
  })

  it('hears the microphone through the snapshot alone, beats included', () => {
    const starter = STARTER_TEMPLATES.find((entry) => entry.id === 'audio-spectrum')!.build()
    const audioNode = starter.nodes.find((entry) => entry.data.nodeType === 'Audio')!
    const nodes = [...withOutput(starter.nodes, { width: 16, height: 8 }), node('beats', 'BeatDetect')]
    const edges = [...starter.edges, edge(audioNode.id, 'audio', 'beats', 'audio')]
    const steps: Step[] = Array.from({ length: 8 }, (_, i) => {
      const spectrum = Array.from({ length: 32 }, (_, bin) => ((bin * 7 + i * 5) % 32) / 32)
      return {
        nodes, edges, tick: i + 1, fullPass: i === 3 || i === 7,
        stores: { useAudioStore: {
          active: true, micActive: true, nativeFastLed: true,
          bass: spectrum[2], mids: spectrum[12], treble: spectrum[26],
          micBass: spectrum[2], micMids: spectrum[12], micTreble: spectrum[26],
          spectrum, detectorSpectrum: spectrum.slice(0, 16), previewSpectrum: spectrum,
          micSpectrum: spectrum, micDetectorSpectrum: spectrum.slice(0, 16),
          leftLevel: 0.2 + i * 0.05, rightLevel: 0.3, beat: i === 1 || i === 5, beatConfidence: 1, bpm: 124,
        } },
      }
    })
    const { main, worker } = bothThreads(steps)
    expect(main.some((step) => step.sawBeat)).toBe(true)
    expect(main[4].shown).not.toEqual(main[0].shown)
    expect(worker).toEqual(main)
  })

  it('reads pots, sensors, MIDI, DMX and DDP through the snapshot alone', () => {
    const nodes = [
      node('ddp', 'DdpInput'), node('out', 'MatrixOutput', { width: 6, height: 4 }),
      node('pot', 'PotInput'), node('motion', 'MotionInput'), node('midi', 'MidiInput', { note: 60, cc: 1 }),
      node('dmx', 'DMXInput', { universe: 0 }), node('channel', 'DMXChannel', { channel: 3 }),
    ]
    const edges = [edge('ddp', 'frame', 'out', 'frame'), edge('dmx', 'dmx', 'channel', 'dmx')]
    const steps: Step[] = Array.from({ length: 5 }, (_, i) => {
      const channels = blankDmxSnapshot(0).channels.map((_, c) => (c * 11 + i * 40) % 256)
      return {
        nodes, edges, tick: i + 1, fullPass: true,
        stores: {
          useHardwareInputStore: {
            pot: new Map([['pot', i / 5]]), button: new Map([['motion', i % 2 === 1]]), encoder: new Map(),
          },
          useMidiStore: {
            supported: true, active: true,
            noteVelocity: new Map([[60, 20 * i]]), ccValues: new Map([[1, 30 + i]]),
            channelNoteVelocity: new Map(), channelCcValues: new Map(),
          },
          useDmxStore: { snapshot: { ...blankDmxSnapshot(0), channels, valid: true, live: true, source: 'helper' } },
          useDdpStore: { live: true, pixels: Uint8Array.from({ length: 6 * 4 * 3 }, (_, b) => (b * 9 + i * 31) % 256) },
        },
      }
    })
    const { main, worker } = bothThreads(steps)
    // The inputs really moved: the pot, the DMX channel and the DDP frame.
    const ports = (step: number, id: string) => (main[step].outputs as [string, Record<string, unknown>][]).find(([n]) => n === id)?.[1]
    expect(ports(4, 'pot')?.value).not.toEqual(ports(0, 'pot')?.value)
    expect(ports(4, 'channel')).not.toEqual(ports(0, 'channel'))
    expect(main[4].shown).not.toEqual(main[0].shown)
    expect(worker).toEqual(main)
  })

  it('answers a pass that throws with an error, not a frame', () => {
    const handle = createPreviewWorkerHandler()
    const broken = { ...node('out', 'MatrixOutput'), data: null } as unknown as StudioNode
    const response = handle({
      nodes: { order: ['out'], changed: [broken] }, edges: [], trusted: true, tick: 1, elapsedTick: 1,
      gridW: 16, gridH: 16, fullPass: false, selectedRouteId: '', streamOutputId: undefined, returned: [],
      live: snapshotLiveState(), openGroupAudioKind: null,
    })
    expect(response.error).toBeTruthy()
    expect(response.fatal).toBe(false)
  })
})
