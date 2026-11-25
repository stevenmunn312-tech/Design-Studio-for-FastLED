import type { StudioEdge, StudioNode } from '../../state/graphStore'
import type { Frame, GroupDef, GroupRegistry } from '../../state/graphEvaluator'
import { outputRoutes } from '../../state/output/outputRouting'
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
 */

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
  /** Buffers of results the main thread has finished with. */
  returned: ArrayBuffer[]
}

export interface PreviewWorkerResponse {
  tick: number
  fullPass: boolean
  terminal: PackedFrame | null
  routed: [string, PackedFrame | null][]
  /** Every node's ports, on a full pass only, with frames packed. */
  outputs: [string, Record<string, unknown>][] | null
  /** Set when the pass threw; `storeRead` when it read a store. */
  error?: string
  storeRead?: boolean
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

/** Every buffer a response carries, to transfer it and later hand it back. */
export function responseBuffers(response: PreviewWorkerResponse): ArrayBuffer[] {
  const buffers: ArrayBuffer[] = []
  const add = (packed: PackedFrame | null) => { if (packed) buffers.push(packed.data.buffer as ArrayBuffer) }
  add(response.terminal)
  for (const [, packed] of response.routed) add(packed)
  for (const [, ports] of response.outputs ?? []) {
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

    const base = { tick: request.tick, fullPass: request.fullPass }
    try {
      const routes = outputRoutes(nodes)
      const selectedRoute = selectPreviewRoute(routes, request.selectedRouteId)
      const result = evaluatePreviewPasses({
        nodes, edges, groups,
        trusted: request.trusted,
        groupInputs: undefined,
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
      const outputs = request.fullPass
        ? [...result.outputs].map(([id, ports]): [string, Record<string, unknown>] => {
            let packed: Record<string, unknown> | null = null
            for (const [port, value] of Object.entries(ports)) {
              if (!isFrame(value)) continue
              packed ??= { ...ports }
              packed[port] = { ...packFrame(value, take), packedFrame: true } satisfies PackedPortFrame
            }
            return [id, packed ?? ports]
          })
        : null
      return {
        ...base,
        terminal: result.terminalFrame ? packFrame(result.terminalFrame, take) : null,
        routed,
        outputs,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { ...base, terminal: null, routed: [], outputs: null, error: message, storeRead: message.startsWith(STORE_READ_ERROR) }
    }
  }
}
