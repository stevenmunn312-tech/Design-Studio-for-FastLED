import type { StudioEdge, StudioNode } from '../../state/graphStore'
import type { GroupDef, GroupRegistry } from '../../state/graphEvaluator'
import type { AudioCapabilityKind } from '../../state/audio/audioCapabilities'
import { responseBuffers, type PreviewLiveState, type PreviewWorkerRequest, type PreviewWorkerResponse } from './previewWorker'

export interface PreviewWorkerFrame {
  nodes: StudioNode[]
  edges: StudioEdge[]
  groups: GroupRegistry
  /** The groups the graph reaches (`workerEvaluable`'s answer). */
  groupIds: string[]
  trusted: boolean
  tick: number
  elapsedTick: number
  gridW: number
  gridH: number
  fullPass: boolean
  selectedRouteId: string
  streamOutputId: string | undefined
  live: PreviewLiveState
  openGroupAudioKind: AudioCapabilityKind | null
}

/**
 * The main thread's side of the preview worker: one request in flight, the
 * graph sent by what changed, and the newest answer kept for the loop to
 * take. `failed` turns the worker path off for the session; the loop then
 * evaluates on the main thread as it always has.
 */
export class PreviewWorkerClient {
  failed = false
  private readonly worker: Worker
  private inFlight = false
  private arrived: PreviewWorkerResponse | null = null
  private sentNodes = new Map<string, StudioNode>()
  private lastNodes: StudioNode[] | null = null
  private lastEdges: StudioEdge[] | null = null
  private sentGroups = new Map<string, { nodes: StudioNode[]; edges: StudioEdge[] }>()
  private lastGroupIds = ''
  private returned: ArrayBuffer[] = []
  private reportedError = false

  static create(): PreviewWorkerClient | null {
    if (typeof Worker === 'undefined') return null
    try {
      return new PreviewWorkerClient(new Worker(
        new URL('./previewEvaluation.worker.ts', import.meta.url),
        { type: 'module', name: 'preview-evaluator' },
      ))
    } catch {
      return null
    }
  }

  private constructor(worker: Worker) {
    this.worker = worker
    worker.onmessage = (event: MessageEvent<PreviewWorkerResponse>) => this.receive(event.data)
    worker.onerror = () => this.fail('the worker failed to load or threw')
    worker.onmessageerror = () => this.fail('a message could not be read')
  }

  /** Whether a request may be sent now. */
  get idle(): boolean {
    return !this.inFlight && !this.failed
  }

  post(frame: PreviewWorkerFrame): void {
    if (!this.idle) return
    const request: PreviewWorkerRequest = {
      trusted: frame.trusted,
      tick: frame.tick,
      elapsedTick: frame.elapsedTick,
      gridW: frame.gridW,
      gridH: frame.gridH,
      fullPass: frame.fullPass,
      selectedRouteId: frame.selectedRouteId,
      streamOutputId: frame.streamOutputId,
      live: frame.live,
      openGroupAudioKind: frame.openGroupAudioKind,
      returned: this.returned,
    }
    if (frame.nodes !== this.lastNodes) {
      const changed = frame.nodes.filter((node) => this.sentNodes.get(node.id) !== node)
      this.sentNodes = new Map(frame.nodes.map((node) => [node.id, node]))
      request.nodes = { order: frame.nodes.map((node) => node.id), changed }
      this.lastNodes = frame.nodes
    }
    if (frame.edges !== this.lastEdges) {
      request.edges = frame.edges
      this.lastEdges = frame.edges
    }
    const changedGroups: [string, GroupDef][] = []
    for (const id of frame.groupIds) {
      const def = frame.groups[id]
      const sent = this.sentGroups.get(id)
      if (def && (sent?.nodes !== def.nodes || sent?.edges !== def.edges)) changedGroups.push([id, def])
    }
    const groupIds = frame.groupIds.join('\n')
    if (changedGroups.length > 0 || groupIds !== this.lastGroupIds) {
      request.groups = { ids: frame.groupIds, changed: changedGroups }
      for (const [id, def] of changedGroups) this.sentGroups.set(id, { nodes: def.nodes, edges: def.edges })
      for (const id of [...this.sentGroups.keys()]) if (!frame.groupIds.includes(id)) this.sentGroups.delete(id)
      this.lastGroupIds = groupIds
    }
    try {
      this.worker.postMessage(request, this.returned)
    } catch {
      // A node that cannot be cloned: the main thread keeps this graph.
      this.fail('a graph could not be sent')
      return
    }
    this.returned = []
    this.inFlight = true
  }

  /** The newest answer since the last call, or null. */
  take(): PreviewWorkerResponse | null {
    const response = this.arrived
    this.arrived = null
    return response
  }

  /** Give a taken answer's buffers back once nothing reads them. */
  release(response: PreviewWorkerResponse): void {
    for (const buffer of responseBuffers(response)) if (buffer.byteLength > 0) this.returned.push(buffer)
  }

  dispose(): void {
    this.worker.terminate()
    this.failed = true
  }

  private receive(response: PreviewWorkerResponse): void {
    this.inFlight = false
    if (response.fatal) {
      this.fail(response.error ?? 'the worker cannot run this graph')
      return
    }
    if (response.error) {
      if (!this.reportedError) console.warn('Preview worker:', response.error)
      this.reportedError = true
      return
    }
    if (this.arrived) this.release(this.arrived)
    this.arrived = response
  }

  private fail(reason: string): void {
    if (this.failed) return
    console.warn(`Preview worker off for this session: ${reason}. Evaluating on the main thread.`)
    this.dispose()
  }
}
