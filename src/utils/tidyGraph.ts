/**
 * "Tidy graph" action: run the layered layout (`tidyLayout`) over the active
 * graph — or just the selection when 2+ nodes are selected — and glide the
 * nodes to their new spots.
 *
 * The whole tidy is a single undo step: the pre-tidy graph is pushed onto the
 * history manually and tracking stays paused while the animation frames
 * stream through the store (the same pause trick `enterGraph` uses).
 */
import { useGraphStore } from '../state/graphStore'
import { exposableInputsFor } from '../state/propertyInputs'
import { useUiStore } from '../state/uiStore'
import { untanglePortOrders, type OrderedPort } from './portOrder'
import { tidyLayout } from './tidyLayout'

const FALLBACK_W = 240
const FALLBACK_H = 100
const TIDY_ANIM_MS = 200
const HISTORY_LIMIT = 100 // graphStore's zundo `limit`

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

/** 0 at the top of the node, 1 at the bottom, at the middle of this port's row. */
function portFraction(ports: readonly OrderedPort[], handle: string | null | undefined): number | undefined {
  if (!handle || ports.length === 0) return undefined
  const index = ports.findIndex((port) => port.id === handle)
  if (index < 0) return undefined
  return (index + 0.5) / ports.length
}

function asPorts(value: unknown): OrderedPort[] {
  if (!Array.isArray(value)) return []
  return value.filter((port): port is OrderedPort => !!port && typeof port === 'object' && typeof port.id === 'string')
}

interface RunTidyOptions {
  /** Ignore a multi-selection and arrange the complete active graph. */
  scope?: 'auto' | 'all'
}

/** Tidy the graph and report via the status bar. Returns how many nodes moved. */
export function runTidy(options: RunTidyOptions = {}): number {
  const s = useGraphStore.getState()
  const selected = s.nodes.filter((n) => n.selected)
  const scoped = options.scope !== 'all' && selected.length >= 2
  const scope = scoped ? selected : s.nodes
  const requestFitView = useUiStore.getState().requestFitView
  const fitNodeIds = scope.map((n) => n.id)

  const scopeById = new Map(scope.map((n) => [n.id, n]))
  const reordered = untanglePortOrders(
    scope.map((node) => ({
      id: node.id,
      nodeType: String(node.data.nodeType ?? ''),
      inputs: asPorts(node.data.inputs),
      outputs: asPorts(node.data.outputs),
    })),
    s.edges,
  )
  const portsOf = (id: string, side: 'inputs' | 'outputs') => {
    const swapped = reordered.get(id)
    const node = scopeById.get(id)
    const ports = swapped?.[side] ?? asPorts(node?.data[side])
    if (side === 'outputs') return ports
    const hidden = new Set(exposableInputsFor(String(node?.data.nodeType ?? '')).map((port) => port.id))
    return ports.filter((port) => !hidden.has(port.id))
  }
  const targets = tidyLayout(
    scope.map((n) => ({
      id: n.id,
      x: n.position.x,
      y: n.position.y,
      width: n.measured?.width ?? FALLBACK_W,
      height: n.measured?.height ?? FALLBACK_H,
    })),
    s.edges.map((edge) => ({
      source: edge.source,
      target: edge.target,
      // Port order is what keeps a bundle of wires from crossing. The centre
      // of a tall node is the same answer for every wire into it.
      sourcePort: portFraction(portsOf(edge.source, 'outputs'), edge.sourceHandle),
      targetPort: portFraction(portsOf(edge.target, 'inputs'), edge.targetHandle),
    })),
  )

  const start = new Map<string, { x: number; y: number }>()
  for (const n of s.nodes) {
    const to = targets.get(n.id)
    if (to && (to.x !== n.position.x || to.y !== n.position.y)) start.set(n.id, { ...n.position })
  }
  const setStatus = useUiStore.getState().setStatus
  if (start.size === 0 && reordered.size === 0) {
    if (fitNodeIds.length > 0) requestFitView(fitNodeIds)
    setStatus('Layout already tidy', 'info')
    return 0
  }

  const temporal = useGraphStore.temporal
  const { pastStates } = temporal.getState()
  temporal.setState({
    pastStates: [...pastStates.slice(-(HISTORY_LIMIT - 1)), { nodes: s.nodes, edges: s.edges, graphData: s.graphData }],
    futureStates: [],
  })
  temporal.getState().pause()

  const apply = (t: number) => {
    useGraphStore.setState((state) => ({
      nodes: state.nodes.map((n) => {
        const ports = reordered.get(n.id)
        const from = start.get(n.id)
        const to = targets.get(n.id)
        if (!ports && (!from || !to)) return n
        return {
          ...n,
          position: from && to
            ? { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t }
            : n.position,
          ...(ports ? { data: { ...n.data, inputs: ports.inputs, outputs: ports.outputs } } : {}),
        }
      }),
    }))
  }

  if (useUiStore.getState().reducedMotion) {
    apply(1)
    temporal.getState().resume()
    requestFitView(fitNodeIds)
  } else {
    const t0 = performance.now()
    let done = false
    const finish = () => {
      if (done) return
      done = true
      apply(1)
      temporal.getState().resume()
      requestFitView(fitNodeIds)
    }
    const step = () => {
      if (done) return
      const t = Math.min(1, (performance.now() - t0) / TIDY_ANIM_MS)
      if (t < 1) {
        apply(easeInOutCubic(t))
        requestAnimationFrame(step)
      } else {
        finish()
      }
    }
    requestAnimationFrame(step)
    // rAF is suspended in background tabs — make sure the layout still lands
    // and history tracking resumes even if no frame ever fires.
    setTimeout(finish, TIDY_ANIM_MS + 100)
  }

  setStatus(
    scoped
      ? `Tidied ${start.size} selected node${start.size === 1 ? '' : 's'}`
      : `Tidied ${start.size} node${start.size === 1 ? '' : 's'}`,
    'success',
  )
  return start.size
}
