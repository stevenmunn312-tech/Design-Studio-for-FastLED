import type { StudioEdge, StudioNode } from '../../state/graphStore'
import type { Frame, GroupDef, GroupRegistry } from '../../state/graphEvaluator'
import { outputRoutes } from '../../state/output/outputRouting'
import { EVALUATOR_STORES } from './evaluatorStores'
import type { AudioCapabilityKind } from '../../state/audio/audioCapabilities'
import { openGroupInputsFor } from '../../state/evaluator/openGroupInputs'
import { evaluatePreviewPasses, selectPreviewRoute, type PreviewRouteBuffers } from './previewEvaluation'

/*
 * The preview worker's protocol, and the handler the worker runs.
 *
 * The main thread keeps the clock and sends one request a frame: the tick,
 * and the graph's changes since the last request, by object identity. The
 * worker evaluates with the same `evaluatePreviewPasses` the main thread uses
 * and answers with packed frames. A frame crosses as a Float64Array of
 * r, g, b per pixel, so every value arrives exactly as the evaluator made it,
 * and its buffer is transferred, not copied. The main thread hands buffers
 * back with its next request. See docs/plans/evaluator-worker-design.md.
 *
 * Live state goes with each request: the data of the stores an admitted
 * node reads (audio, the hardware-input widgets, MIDI, DMX and DDP) and the
 * test-signal switch. The worker writes them into its own copies of those
 * stores before the pass, so the nodes read them exactly as they do on the
 * main thread. Nothing an admitted node does writes back to a store.
 */

/** The stores the worker is sent each frame; every other store is blocked. */
export const LIVE_STATE_STORES: ReadonlySet<string> = new Set([
  'useAudioStore', 'useDecoderAudioStore', 'useUiStore',
  'useHardwareInputStore', 'useMidiStore', 'useDmxStore', 'useDdpStore',
])

/** The fields of `useUiStore` an admitted node may read; the rest of that
 *  store is the app's, and large. Every other live store is sent whole. */
export const LIVE_UI_FIELDS: readonly string[] = ['testSignal']

/** Each live store's data, by store name. */
export type PreviewLiveState = Record<string, Record<string, unknown>>

const LIVE_STORES = EVALUATOR_STORES.filter(([name]) => LIVE_STATE_STORES.has(name))

/** Node types whose ports the loop reads on every frame, not only on a
 *  publish: Master Speed sets the next frame's clock, the VU feeds its rails. */
const EVERY_FRAME_OUTPUT_TYPES = new Set(['MasterSpeed', 'StereoVuMeter'])

export interface PackedFrame {
  w: number
  h: number
  data: Float64Array
}

/** A frame inside a node's published ports, marked so it can be unpacked. */
export interface PackedPortFrame extends PackedFrame {
  packedFrame: true
}

export interface PreviewWorkerRequest {
  /** The graph's node order and the nodes that changed, when it changed. */
  nodes?: { order: string[]; changed: StudioNode[] }
  edges?: StudioEdge[]
  /** The reachable groups, and the ones that changed, when any did. */
  groups?: { ids: string[]; changed: [string, GroupDef][] }
  trusted: boolean
  tick: number
  elapsedTick: number
  gridW: number
  gridH: number
  fullPass: boolean
  selectedRouteId: string
  streamOutputId: string | undefined
  live: PreviewLiveState
  /** For a group opened on the canvas, the source its audio inputs bind to. */
  openGroupAudioKind: AudioCapabilityKind | null
  /** Buffers of results the main thread has finished with. */
  returned: ArrayBuffer[]
}

export interface PreviewWorkerResponse {
  tick: number
  fullPass: boolean
  terminal: PackedFrame | null
  routed: [string, PackedFrame | null][]
  /** Whether a node fired a beat this pass. */
  sawBeat: boolean
  /** Every evaluated node's ports, on a full pass or a beat, frames packed. */
  outputs: [string, Record<string, unknown>][] | null
  /** The ports of Master Speed and the Stereo VU, on every pass. */
  liveOutputs: [string, Record<string, unknown>][]
  /** Set when the pass threw. `fatal` when the worker cannot run this graph
   *  (it read a blocked store, or a value would not cross): the main thread
   *  then takes the preview back. */
  error?: string
  fatal?: boolean
}

/** Thrown in the worker by a store's `getState`, which holds nothing there. */
export const STORE_READ_ERROR = 'preview worker: store read'

const isFrame = (value: unknown): value is Frame =>
  Array.isArray(value) && Array.isArray(value[0]) && typeof (value[0] as unknown[])[0] === 'object'

export function packFrame(frame: Frame, take: (length: number) => Float64Array): PackedFrame {
  const h = frame.length
  const w = frame[0]?.length ?? 0
  const data = take(w * h * 3)
  let i = 0
  for (const row of frame) {
    for (const pixel of row) { data[i++] = pixel.r; data[i++] = pixel.g; data[i++] = pixel.b }
  }
  return { w, h, data }
}

/** Unpack into `reuse` when it is the right size, else into a new frame. */
export function unpackFrame(packed: PackedFrame, reuse: Frame | null): Frame {
  const { w, h, data } = packed
  const frame = reuse && reuse.length === h && (reuse[0]?.length ?? 0) === w
    ? reuse
    : Array.from({ length: h }, () => Array.from({ length: w }, () => ({ r: 0, g: 0, b: 0 })))
  let i = 0
  for (const row of frame) {
    for (const pixel of row) { pixel.r = data[i++]; pixel.g = data[i++]; pixel.b = data[i++] }
  }
  return frame
}

/** A node's ports with any frame unpacked into a frame of its own. */
export function unpackPorts(ports: Record<string, unknown>): Record<string, unknown> {
  let out: Record<string, unknown> | null = null
  for (const [port, value] of Object.entries(ports)) {
    if (!value || typeof value !== 'object' || !(value as Partial<PackedPortFrame>).packedFrame) continue
    out ??= { ...ports }
    out[port] = unpackFrame(value as PackedPortFrame, null)
  }
  return out ?? ports
}

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ArrayBuffer.isView(value)) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

const isData = (value: object): boolean =>
  Array.isArray(value) || ArrayBuffer.isView(value) || value instanceof Map || value instanceof Set || isPlainObject(value)

/** A record without what cannot cross a thread boundary: functions (a
 *  store's actions) and objects of a class (a media element). Maps, sets and
 *  typed arrays (a widget's pots, a DDP frame) cross as they are. */
export function plainData(record: object): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(record)) {
    if (typeof value === 'function') continue
    if (value && typeof value === 'object' && !isData(value)) continue
    out[key] = value
  }
  return out
}

/** What the worker is sent each frame, read from this thread's stores. */
export function snapshotLiveState(): PreviewLiveState {
  const live: PreviewLiveState = {}
  for (const [name, store] of LIVE_STORES) {
    const state = store.getState() as Record<string, unknown>
    live[name] = name === 'useUiStore'
      ? Object.fromEntries(LIVE_UI_FIELDS.map((field) => [field, state[field]]))
      : plainData(state)
  }
  return live
}

function applyLiveState(live: PreviewLiveState): void {
  for (const [name, store] of LIVE_STORES) if (live[name]) store.setState(live[name])
}

/** A node's ports ready to post: frames packed, live signals made plain. */
function postablePorts(ports: Record<string, unknown>, take: (length: number) => Float64Array): Record<string, unknown> {
  let out: Record<string, unknown> | null = null
  for (const [port, value] of Object.entries(ports)) {
    let next: unknown = value
    if (isFrame(value)) next = { ...packFrame(value, take), packedFrame: true } satisfies PackedPortFrame
    // An Audio node publishes its store's state, actions included.
    else if (isPlainObject(value) && Object.values(value).some((entry) => typeof entry === 'function')) next = plainData(value)
    if (next === value) continue
    out ??= { ...ports }
    out[port] = next
  }
  return out ?? ports
}

/** Every buffer a response carries, to transfer it and later hand it back. */
export function responseBuffers(response: PreviewWorkerResponse): ArrayBuffer[] {
  const buffers: ArrayBuffer[] = []
  const add = (packed: PackedFrame | null) => { if (packed) buffers.push(packed.data.buffer as ArrayBuffer) }
  add(response.terminal)
  for (const [, packed] of response.routed) add(packed)
  for (const [, ports] of [...(response.outputs ?? []), ...response.liveOutputs]) {
    for (const value of Object.values(ports)) {
      if (value && typeof value === 'object' && (value as Partial<PackedPortFrame>).packedFrame) add(value as PackedPortFrame)
    }
  }
  return buffers
}

/**
 * The worker's state and its answer to one request. Plain functions, so a
 * test runs the worker's exact path without a Worker.
 */
export function createPreviewWorkerHandler(): (request: PreviewWorkerRequest) => PreviewWorkerResponse {
  const nodeById = new Map<string, StudioNode>()
  // Kept as the same arrays until the graph changes: the evaluator caches its
  // hot set on their identity.
  let nodes: StudioNode[] = []
  let edges: StudioEdge[] = []
  const groupById = new Map<string, GroupDef>()
  let groups: GroupRegistry = {}
  const buffers: PreviewRouteBuffers = { selected: null, stream: null }
  const free = new Map<number, ArrayBuffer[]>()
  const take = (length: number): Float64Array => {
    const buffer = free.get(length)?.pop()
    return buffer ? new Float64Array(buffer) : new Float64Array(length)
  }

  return (request) => {
    for (const buffer of request.returned) {
      const length = buffer.byteLength / Float64Array.BYTES_PER_ELEMENT
      const list = free.get(length) ?? []
      if (list.length < 16) list.push(buffer)
      free.set(length, list)
    }
    if (request.nodes) {
      for (const node of request.nodes.changed) nodeById.set(node.id, node)
      const keep = new Set(request.nodes.order)
      for (const id of [...nodeById.keys()]) if (!keep.has(id)) nodeById.delete(id)
      nodes = request.nodes.order.map((id) => nodeById.get(id)!).filter(Boolean)
    }
    if (request.edges) edges = request.edges
    if (request.groups) {
      for (const [id, def] of request.groups.changed) groupById.set(id, def)
      const keep = new Set(request.groups.ids)
      for (const id of [...groupById.keys()]) if (!keep.has(id)) groupById.delete(id)
      groups = Object.fromEntries(groupById)
    }

    const base = { tick: request.tick, fullPass: request.fullPass, sawBeat: false, liveOutputs: [] }
    try {
      applyLiveState(request.live)
      const routes = outputRoutes(nodes)
      const selectedRoute = selectPreviewRoute(routes, request.selectedRouteId)
      const result = evaluatePreviewPasses({
        nodes, edges, groups,
        trusted: request.trusted,
        groupInputs: request.openGroupAudioKind ? openGroupInputsFor(nodes, request.openGroupAudioKind) : undefined,
        tick: request.tick,
        elapsedTick: request.elapsedTick,
        gridW: request.gridW,
        gridH: request.gridH,
        fullPass: request.fullPass,
        streamOutputId: request.streamOutputId,
      }, selectedRoute, buffers)
      const routed: [string, PackedFrame | null][] = []
      for (const [id, frame] of result.routedByOutput) {
        if (id === selectedRoute?.id && frame) buffers.selected = frame
        if (id === request.streamOutputId && frame) buffers.stream = frame
        routed.push([id, frame ? packFrame(frame, take) : null])
      }
      // A beat publishes the node previews on the frame it lands, as the
      // main thread does, so they need this pass's ports too.
      const outputs = request.fullPass || result.sawBeat
        ? [...result.outputs].map(([id, ports]): [string, Record<string, unknown>] => [id, postablePorts(ports, take)])
        : null
      const liveOutputs: [string, Record<string, unknown>][] = []
      for (const [id, ports] of result.outputs) {
        const type = String(nodeById.get(id)?.data.nodeType ?? '')
        if (EVERY_FRAME_OUTPUT_TYPES.has(type)) liveOutputs.push([id, postablePorts(ports, take)])
      }
      return {
        ...base,
        sawBeat: result.sawBeat,
        terminal: result.terminalFrame ? packFrame(result.terminalFrame, take) : null,
        routed,
        outputs,
        liveOutputs,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { ...base, terminal: null, routed: [], outputs: null, error: message, fatal: message.startsWith(STORE_READ_ERROR) }
    }
  }
}
