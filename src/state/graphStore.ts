import { create, useStore } from 'zustand'
import { temporal } from 'zundo'
import type { TemporalState } from 'zundo'
import {
  type Node,
  type Edge,
  type NodeChange,
  type EdgeChange,
  type Connection,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  reconnectEdge,
} from '@xyflow/react'
import type { NodeCategory } from '../types'
import { NODE_LIBRARY, portColor } from './nodeLibrary'
import type { GroupRegistry } from './graphEvaluator'
import type { SavedPattern } from './patternLibrary'
import { useUiStore } from './uiStore'

export interface StudioNodeData extends Record<string, unknown> {
  label: string
  nodeType: string
  category: NodeCategory
  properties: Record<string, unknown>
}

export type StudioNode = Node<StudioNodeData>
export type StudioEdge = Edge

/** The implicit top-level graph that owns the MatrixOutput. */
export const ROOT_GRAPH_ID = 'root'

export interface GraphMeta {
  id: string
  name: string
  /** Present when this group came from a saved "My Patterns" library entry. */
  sourcePatternId?: string
}
export interface GraphContent { nodes: StudioNode[]; edges: StudioEdge[] }

/** The pieces of the multi-graph workspace that must survive save/restore on
 *  top of the active `nodes`/`edges` — without these, every group's subgraph
 *  (and thus its preview and codegen) is lost on reload. */
export interface WorkspaceExtras {
  graphData?: Record<string, GraphContent>
  graphs?: Record<string, GraphMeta>
  activeGraphId?: string
}

interface GraphState {
  // The active graph being edited. Kept at the top level so every existing
  // consumer (`s.nodes`, `s.edges`) and action is unchanged.
  nodes: StudioNode[]
  edges: StudioEdge[]
  selectedNodeId: string | null
  /** Holds one or more copied nodes plus the edges wiring them together
   *  (internal edges only — boundary edges to nodes outside the copy aren't
   *  carried along). */
  clipboard: { nodes: StudioNode[]; edges: StudioEdge[] } | null

  // ── Multi-graph workspace (ADR 0001, Phase 1) ──────────────────────────
  activeGraphId: string
  /** Metadata for every graph: the root plus each pattern group. */
  graphs: Record<string, GraphMeta>
  /** Stored content for every graph EXCEPT the active one (which lives in
   *  `nodes`/`edges` above). */
  graphData: Record<string, GraphContent>

  onNodesChange: (changes: NodeChange[]) => void
  onEdgesChange: (changes: EdgeChange[]) => void
  onConnect: (connection: Connection) => void
  /** Add a node. With `centreOnDrop`, the node's `position` is treated as the
   *  point its *centre* should land on once measured (used by click-to-add so
   *  the node appears vertically centred on the drop point rather than hanging
   *  below it). */
  addNode: (node: StudioNode, centreOnDrop?: boolean) => void
  /** Drop-to-splice: insert a node onto an existing edge, rewiring it as
   *  source → node → target (then spread the area so the noodles aren't tiny). */
  insertNodeOnEdge: (node: StudioNode, edgeId: string, inHandle: string, outHandle: string) => void
  /** Splice an unconnected node that already exists on the canvas into an edge. */
  spliceNodeOnEdge: (nodeId: string, edgeId: string, inHandle: string, outHandle: string) => void
  /** Push connected nodes apart so no noodle is uncomfortably short. Only ever
   *  moves nodes rightward, so it tidies a cramped area without disturbing a
   *  layout that already has room. */
  spreadNodes: () => void
  selectNode: (id: string | null) => void
  selectAllNodes: () => void
  /** Deselect every node (Escape) — clears both the marquee/click selection
   *  state on the nodes and the Inspector's `selectedNodeId`. */
  clearSelection: () => void
  updateNodeProperty: (id: string, key: string, value: unknown) => void
  updateNodeProperties: (id: string, updates: Record<string, unknown>) => void
  loadGraph: (nodes: StudioNode[], edges: StudioEdge[], workspace?: WorkspaceExtras) => void
  duplicateNode: (id: string) => void
  copyNode: (id: string) => void
  /** Copy every currently multi-selected node (`node.selected`) plus the edges
   *  wiring them together, so a selection with internal wiring pastes intact. */
  copySelection: () => void
  pasteNode: (position: { x: number; y: number }) => void
  deleteNode: (id: string) => void
  disconnectNode: (id: string) => void
  /** Remove a single edge (a "noodle"), e.g. when unplugged onto empty space. */
  removeEdge: (id: string) => void
  /** Re-route an edge to a new connection when its end is dragged to a port. */
  reconnectNoodle: (oldEdge: StudioEdge, newConnection: Connection) => void

  /** Switch the active graph, stashing the current one. */
  enterGraph: (id: string) => void
  /** Encapsulate the given nodes into a new group, replacing them in the
   *  active graph with a single Group node. Returns the new group id. */
  createGroup: (name: string, nodeIds: string[], options?: CreateGroupOptions) => string
  /** Inline a Group node back into the active graph, deleting its wrapper
   *  subgraph entry once its contents have been restored. */
  ungroupNode: (id: string) => boolean
  /** Drop a copy of a saved library pattern onto the canvas as a Group node,
   *  registering its subgraph under a fresh group id. With `centreOnDrop`, the
   *  Group node settles vertically centred on `position` once measured (see
   *  `addNode`). */
  instantiatePattern: (saved: SavedPattern, position: { x: number; y: number }, centreOnDrop?: boolean) => void
  /** Create a Pattern Collection pre-populated with cloned copies of the given
   *  saved library patterns, registering each as a fresh subgraph in the
   *  workspace so the collection can drive previews/codegen immediately. */
  createCollectionFromPatterns: (
    savedPatterns: SavedPattern[],
    position: { x: number; y: number },
    properties?: Record<string, unknown>,
    centreOnDrop?: boolean,
  ) => void
  /** Absorb a Group node into a PatternCollection: remove it (and its edges)
   *  from the canvas and record its group id in the collection's list. */
  addToCollection: (collectionNodeId: string, groupNodeId: string) => void
  /** Add a saved library pattern directly into a PatternCollection — clones its
   *  subgraph into a fresh group id (like `instantiatePattern`) and appends it to
   *  the collection's list, without ever placing a Group node on the canvas. */
  addPatternToCollection: (collectionNodeId: string, saved: SavedPattern) => void
  /** Remove a pattern (group id) from a PatternCollection, dropping its subgraph. */
  removeFromCollection: (collectionNodeId: string, groupId: string) => void
  /** Toggle a song-section tag on a collection pattern (section-aware selection).
   *  An empty tag set means the pattern is eligible in any section. */
  togglePatternSection: (collectionNodeId: string, groupId: string, section: string) => void
  /** Replace a collection pattern's whole section-tag set in one go — backs the
   *  "all" chip (selects every section) and its clear-back-to-any toggle. */
  setPatternSections: (collectionNodeId: string, groupId: string, sections: string[]) => void
  /** Add a GroupInput node to the current subgraph so a pattern can expose a role
   *  knob (energy/speed/palette) for show modulation. Only acts inside a group. */
  addGroupInput: () => void
  /** Set a GroupInput's show role: its `paramId` (what the generator drives) plus
   *  its output port dataType (`palette` for the palette role, else `float`). */
  setGroupInputRole: (nodeId: string, role: string) => void
}

type HistorySlice = Pick<GraphState, 'nodes' | 'edges'>

// Legacy node types folded into bundled nodes (Noise / Math / Transition /
// Blend), mapped to the bundle plus the variant property that selects the old
// behaviour. Graphs exported before consolidation still reference the old
// types; upgrade them on import so they keep working and gain the inline
// variant dropdown.
// Node types that are scene-level singletons (the matrix output) or signal
// sources (mic / music library) — these are left behind in the parent graph
// when encapsulating a selection into a group, not sealed inside it.
const GROUP_EXCLUDED_TYPES = new Set(['MatrixOutput', 'MicInput', 'MusicLibrary'])

/** Nodes that represent one scene-wide hardware resource. Creation actions use
 *  this set as a final guard, so every UI path (click, drop, paste, duplicate)
 *  preserves the one-per-canvas invariant. */
export const SINGLETON_NODE_TYPES = new Set(['MatrixOutput', 'MicInput'])

export function canAddNodeType(nodes: StudioNode[], nodeType: string): boolean {
  return !SINGLETON_NODE_TYPES.has(nodeType) || !nodes.some((n) => n.data.nodeType === nodeType)
}

export interface CreateGroupOptions {
  /** Saved to the pattern library right after creation (the caller still has
   *  to actually save it — this flag is just threaded through from the dialog). */
  saveToLibrary?: boolean
  /** Node ids (within the selection) whose unconnected `paletteIn` port should
   *  be wired to a shared "palette" show-input role, so a PerformanceGenerator
   *  with "use group inputs" on can replace it per-section. */
  exposePaletteNodeIds?: string[]
}

// Library definitions by type, for refreshing saved nodes on load.
const LIBRARY_DEF = new Map(NODE_LIBRARY.map((def) => [def.type, def]))

// Reload library-backed nodes from the current node library so categories,
// labels, and port definitions stay canonical across save/load. Programmatic
// group-family nodes keep their saved shape.
// Legacy node types folded into another node on load. AnimatedImage merged into
// the single Image node (which now handles stills and animations alike) — its
// `animation`/`playbackRate`/`loop` properties carry over unchanged.
const LEGACY_TYPE_RENAME: Record<string, string> = { AnimatedImage: 'Image' }

function normalizeLoadedGraph(nodes: StudioNode[], edges: StudioEdge[]): { nodes: StudioNode[]; edges: StudioEdge[] } {
  const normalizedNodes = nodes.map((n) => {
    const data = n.data as StudioNodeData
    const nodeType = LEGACY_TYPE_RENAME[data.nodeType] ?? data.nodeType
    const def = LIBRARY_DEF.get(nodeType)
    const category: NodeCategory = def?.category ?? data.category
    const label = def?.label ?? data.label
    const properties = { ...data.properties }
    const inputs = def?.inputs ?? (Array.isArray(data.inputs) ? data.inputs : [])
    const outputs = def?.outputs ?? (Array.isArray(data.outputs) ? data.outputs : [])
    return { ...n, data: { ...data, nodeType, label, category, properties, inputs, outputs } }
  })
  return { nodes: normalizedNodes, edges: edges.map((e) => ({ ...e })) }
}

// Minimum horizontal clearance to keep between a node's right edge and the left
// edge of a node it feeds — anything tighter makes for a cramped, stubby noodle.
const MIN_NODE_GAP = 60
const DEFAULT_NODE_W = 180
const DEFAULT_NODE_H = 100

// Nodes added via "click to add" want to settle centred on the drop point, but
// their real height is only known after React Flow measures them. This maps a
// pending node id → the flow-y its *centre* should land on; onNodesChange
// consumes it on the first `dimensions` change (ResizeObserver-driven, so it
// fires even in a background tab, unlike requestAnimationFrame).
const pendingCentreY = new Map<string, number>()

// Walk edges left-to-right and shift any target that crowds its source rightward
// to restore MIN_NODE_GAP. "Crowds" means too close horizontally *and*
// overlapping vertically — so a pair you've deliberately stacked vertically (a
// long noodle dropping down a column) is left alone; only genuinely cramped /
// overlapping connected nodes move. We only ever push right and process sources
// in x order, so one pass cascades down a chain and always terminates. X is
// snapped to the 20px canvas grid.
function spreadNodesByEdges(nodes: StudioNode[], edges: StudioEdge[]): StudioNode[] {
  const x = new Map(nodes.map((n) => [n.id, n.position.x]))
  const y = new Map(nodes.map((n) => [n.id, n.position.y]))
  const w = new Map(nodes.map((n) => [n.id, n.measured?.width ?? DEFAULT_NODE_W]))
  const h = new Map(nodes.map((n) => [n.id, n.measured?.height ?? DEFAULT_NODE_H]))
  const ordered = [...edges].sort((a, b) => (x.get(a.source!) ?? 0) - (x.get(b.source!) ?? 0))
  let changed = false
  for (const e of ordered) {
    const sx = x.get(e.source!)
    const tx = x.get(e.target!)
    if (sx === undefined || tx === undefined) continue
    const sw = w.get(e.source!) ?? DEFAULT_NODE_W
    const gapH = tx - (sx + sw)
    const sCy = (y.get(e.source!) ?? 0) + (h.get(e.source!) ?? DEFAULT_NODE_H) / 2
    const tCy = (y.get(e.target!) ?? 0) + (h.get(e.target!) ?? DEFAULT_NODE_H) / 2
    const vOverlap = Math.abs(sCy - tCy) < ((h.get(e.source!) ?? DEFAULT_NODE_H) + (h.get(e.target!) ?? DEFAULT_NODE_H)) / 2
    if (gapH < MIN_NODE_GAP && vOverlap) {
      x.set(e.target!, Math.round((sx + sw + MIN_NODE_GAP) / 20) * 20)
      changed = true
    }
  }
  if (!changed) return nodes
  return nodes.map((n) => {
    const nx = x.get(n.id)
    return nx !== undefined && nx !== n.position.x ? { ...n, position: { ...n.position, x: nx } } : n
  })
}

function edgeStrokeForPort(node: StudioNode | undefined, handleId: string | undefined): string {
  if (!node || !handleId) return '#00bfff'
  const data = node.data as StudioNodeData & {
    inputs?: { id: string; dataType: string }[]
    outputs?: { id: string; dataType: string }[]
  }
  const port = [...(data.outputs ?? []), ...(data.inputs ?? [])].find((p) => p.id === handleId)
  return portColor(port?.dataType ?? 'float')
}

function studioNodeType(node: StudioNode | undefined): string {
  return String(node?.data.nodeType ?? '')
}

function uniqueId(base: string, used: Set<string>): string {
  let candidate = base
  let suffix = 1
  while (used.has(candidate)) candidate = `${base}-${suffix++}`
  used.add(candidate)
  return candidate
}

// A burst of rapid edits (dragging a slider, typing in a text field) calls
// zundo's handleSet once per tick/keystroke. Debouncing it naively would keep
// only the *last* call's pastState — undoing the burst would then revert just
// the final tiny increment instead of the whole gesture. So pin the pastState
// from the first call in a burst, and only push a snapshot once the burst has
// gone quiet, using the most recent currentState/deltaState by then.
function debounceHandleSet<Fn extends (pastState: never, replace: never, currentState: never, deltaState?: never) => void>(
  fn: Fn,
  ms: number
): Fn {
  type Args = Parameters<Fn>
  let timer: ReturnType<typeof setTimeout> | undefined
  let burstStart: Args[0] | undefined
  return ((...args: Args) => {
    const [pastState, replace, currentState, deltaState] = args
    if (timer === undefined) burstStart = pastState
    if (timer !== undefined) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = undefined
      fn(burstStart as Args[0], replace, currentState, deltaState)
    }, ms)
  }) as Fn
}

export const useGraphStore = create<GraphState>()(
  temporal(
    (set) => ({
      nodes: [],
      edges: [],
      selectedNodeId: null,
      clipboard: null,

      activeGraphId: ROOT_GRAPH_ID,
      graphs: { [ROOT_GRAPH_ID]: { id: ROOT_GRAPH_ID, name: 'Main' } },
      graphData: {},

      onNodesChange: (changes) =>
        set((s) => {
          let nodes = applyNodeChanges(changes, s.nodes) as StudioNode[]
          // Once a click-to-add node has been measured, lift it by half its
          // height so it settles centred on the drop point (see pendingCentreY).
          if (pendingCentreY.size) {
            nodes = nodes.map((n) => {
              const centreY = pendingCentreY.get(n.id)
              const h = n.measured?.height
              if (centreY === undefined || !h) return n
              pendingCentreY.delete(n.id)
              return { ...n, position: { ...n.position, y: centreY - h / 2 } }
            })
          }
          const selectedNodeId = s.selectedNodeId && nodes.some((n) => n.id === s.selectedNodeId)
            ? s.selectedNodeId
            : null
          return { nodes, selectedNodeId }
        }),

      onEdgesChange: (changes) =>
        set((s) => ({ edges: applyEdgeChanges(changes, s.edges) })),

      onConnect: (connection) =>
        set((s) => {
          const src = s.nodes.find((n) => n.id === connection.source)
          const color = edgeStrokeForPort(src, connection.sourceHandle ?? undefined)
          const replaced = connection.target && connection.targetHandle
            ? s.edges.filter((e) => !(e.target === connection.target && e.targetHandle === connection.targetHandle))
            : s.edges
          // `reconnectable: 'target'` lets a noodle be unplugged/re-routed from
          // the input (target) end only — grab it at the input port and drag.
          return { edges: addEdge({ ...connection, type: 'glowEdge', reconnectable: 'target', style: { stroke: color } }, replaced) }
        }),

      removeEdge: (id) =>
        set((s) => ({ edges: s.edges.filter((e) => e.id !== id) })),

      reconnectNoodle: (oldEdge, newConnection) =>
        set((s) => {
          const replaced = newConnection.target && newConnection.targetHandle
            ? s.edges.filter((e) =>
              e.id === oldEdge.id || !(e.target === newConnection.target && e.targetHandle === newConnection.targetHandle))
            : s.edges
          const edges = reconnectEdge(oldEdge, newConnection, replaced)
          const src = s.nodes.find((n) => n.id === newConnection.source)
          const color = edgeStrokeForPort(src, newConnection.sourceHandle ?? undefined)
          return {
            edges: edges.map((edge) => edge.id === oldEdge.id ? { ...edge, style: { ...edge.style, stroke: color } } : edge),
          }
        }),

      addNode: (node, centreOnDrop) => {
        set((s) => {
          if (!canAddNodeType(s.nodes, node.data.nodeType)) return s
          if (centreOnDrop) pendingCentreY.set(node.id, node.position.y)
          return { nodes: [...s.nodes, node] }
        })
      },

      insertNodeOnEdge: (node, edgeId, inHandle, outHandle) =>
        set((s) => {
          if (!canAddNodeType(s.nodes, node.data.nodeType)) return s
          const old = s.edges.find((e) => e.id === edgeId)
          if (!old) return { nodes: [...s.nodes, node] }
          const srcNode = s.nodes.find((n) => n.id === old.source)
          const srcColor = edgeStrokeForPort(srcNode, old.sourceHandle ?? undefined)
          const newColor = edgeStrokeForPort(node, outHandle ?? undefined)
          // Two new noodles replace the old one, matching onConnect's style so the
          // MiniMap/reconnect behaviour is identical.
          const e1 = {
            id: `e-${node.id}-in`, source: old.source!, sourceHandle: old.sourceHandle,
            target: node.id, targetHandle: inHandle,
            type: 'glowEdge', reconnectable: 'target', style: { stroke: srcColor },
          } as StudioEdge
          const e2 = {
            id: `e-${node.id}-out`, source: node.id, sourceHandle: outHandle,
            target: old.target!, targetHandle: old.targetHandle,
            type: 'glowEdge', reconnectable: 'target', style: { stroke: newColor },
          } as StudioEdge
          const nodes = [...s.nodes, node]
          const edges = [...s.edges.filter((e) => e.id !== edgeId), e1, e2]
          return { nodes: spreadNodesByEdges(nodes, edges), edges }
        }),

      spliceNodeOnEdge: (nodeId, edgeId, inHandle, outHandle) =>
        set((s) => {
          const node = s.nodes.find((n) => n.id === nodeId)
          const old = s.edges.find((e) => e.id === edgeId)
          // Existing-node splicing is deliberately limited to loose nodes; a
          // connected node would otherwise silently tear or duplicate wiring.
          if (!node || !old || s.edges.some((e) => e.source === nodeId || e.target === nodeId)) return s
          const srcNode = s.nodes.find((n) => n.id === old.source)
          const srcColor = edgeStrokeForPort(srcNode, old.sourceHandle ?? undefined)
          const newColor = edgeStrokeForPort(node, outHandle)
          const e1 = {
            id: `e-${node.id}-in`, source: old.source!, sourceHandle: old.sourceHandle,
            target: node.id, targetHandle: inHandle,
            type: 'glowEdge', reconnectable: 'target', style: { stroke: srcColor },
          } as StudioEdge
          const e2 = {
            id: `e-${node.id}-out`, source: node.id, sourceHandle: outHandle,
            target: old.target!, targetHandle: old.targetHandle,
            type: 'glowEdge', reconnectable: 'target', style: { stroke: newColor },
          } as StudioEdge
          const edges = [...s.edges.filter((e) => e.id !== edgeId), e1, e2]
          return { nodes: spreadNodesByEdges(s.nodes, edges), edges }
        }),

      spreadNodes: () =>
        set((s) => ({ nodes: spreadNodesByEdges(s.nodes, s.edges) })),

      selectNode: (id) => set({ selectedNodeId: id }),

      selectAllNodes: () =>
        set((s) => ({ nodes: s.nodes.map((n) => ({ ...n, selected: true })) })),

      clearSelection: () =>
        set((s) => ({
          selectedNodeId: null,
          nodes: s.nodes.some((n) => n.selected)
            ? s.nodes.map((n) => (n.selected ? { ...n, selected: false } : n))
            : s.nodes,
        })),

      copyNode: (id) =>
        set((s) => {
          const node = s.nodes.find((n) => n.id === id)
          return node ? { clipboard: { nodes: [node], edges: [] } } : s
        }),

      copySelection: () =>
        set((s) => {
          const selected = s.nodes.filter((n) => n.selected)
          if (selected.length === 0) return s
          const idSet = new Set(selected.map((n) => n.id))
          const internal = s.edges.filter((e) => idSet.has(e.source!) && idSet.has(e.target!))
          return { clipboard: { nodes: selected, edges: internal } }
        }),

      pasteNode: (position) =>
        set((s) => {
          if (!s.clipboard || s.clipboard.nodes.length === 0) return s
          const { nodes: copied, edges: copiedEdges } = s.clipboard
          const pastable = copied.filter((n) => canAddNodeType(s.nodes, n.data.nodeType))
          if (pastable.length === 0) return s
          const pastableIds = new Set(pastable.map((n) => n.id))

          // Anchor the paste on the centroid of the copied nodes so a
          // multi-node selection lands together, centred on `position`.
          const cx = pastable.reduce((sum, n) => sum + n.position.x, 0) / pastable.length
          const cy = pastable.reduce((sum, n) => sum + n.position.y, 0) / pastable.length
          const dx = position.x - cx
          const dy = position.y - cy

          const used = new Set(s.nodes.map((n) => n.id))
          const idMap = new Map<string, string>()
          const newNodes = pastable.map((n) => {
            const newId = uniqueId(`${n.data.nodeType}-${Date.now()}`, used)
            idMap.set(n.id, newId)
            return {
              ...n,
              id: newId,
              position: { x: n.position.x + dx, y: n.position.y + dy },
              selected: true,
            }
          })
          const newEdges = copiedEdges
            .filter((e) => pastableIds.has(e.source!) && pastableIds.has(e.target!))
            .map((e) => ({
              ...e,
              id: `e-${idMap.get(e.source!)}-${idMap.get(e.target!)}-${e.sourceHandle}-${e.targetHandle}`,
              source: idMap.get(e.source!)!,
              target: idMap.get(e.target!)!,
            }))

          return {
            nodes: [...s.nodes.map((n) => (n.selected ? { ...n, selected: false } : n)), ...newNodes],
            edges: [...s.edges, ...newEdges],
          }
        }),

      updateNodeProperty: (id, key, value) =>
        set((s) => ({
          nodes: s.nodes.map((n) =>
            n.id === id
              ? { ...n, data: { ...n.data, properties: { ...n.data.properties, [key]: value } } }
              : n
          ),
        })),

      updateNodeProperties: (id, updates) =>
        set((s) => ({
          nodes: s.nodes.map((n) =>
            n.id === id
              ? { ...n, data: { ...n.data, properties: { ...n.data.properties, ...updates } } }
              : n
          ),
        })),

      loadGraph: (nodes, edges, workspace) =>
        set(() => {
          // Restore the active graph plus every stashed pattern-group subgraph.
          const active = normalizeLoadedGraph(nodes, edges)
          const graphData: Record<string, GraphContent> = {}
          for (const [id, content] of Object.entries(workspace?.graphData ?? {})) {
            graphData[id] = normalizeLoadedGraph(content.nodes ?? [], content.edges ?? [])
          }
          const graphs: Record<string, GraphMeta> = {
            [ROOT_GRAPH_ID]: { id: ROOT_GRAPH_ID, name: 'Main' },
            ...(workspace?.graphs ?? {}),
          }
          return {
            ...active,
            graphData,
            graphs,
            activeGraphId: workspace?.activeGraphId ?? ROOT_GRAPH_ID,
            selectedNodeId: null,
          }
        }),

      duplicateNode: (id) =>
        set((s) => {
          const node = s.nodes.find((n) => n.id === id)
          if (!node || !canAddNodeType(s.nodes, node.data.nodeType)) return s
          return {
            nodes: [...s.nodes, {
              ...node,
              id: `${node.data.nodeType}-${Date.now()}`,
              position: { x: node.position.x + 20, y: node.position.y + 20 },
              selected: false,
            }],
          }
        }),

      deleteNode: (id) =>
        set((s) => ({
          nodes: s.nodes.filter((n) => n.id !== id),
          edges: s.edges.filter((e) => e.source !== id && e.target !== id),
          selectedNodeId: s.selectedNodeId === id ? null : s.selectedNodeId,
        })),

      disconnectNode: (id) =>
        set((s) => ({
          edges: s.edges.filter((e) => e.source !== id && e.target !== id),
        })),

      enterGraph: (id) =>
        set((s) => {
          if (id === s.activeGraphId || !s.graphs[id]) return s
          // Stash the current graph, load the target. Graph navigation is not
          // an undoable edit, so pause + clear history around the swap.
          const temporalApi = useGraphStore.temporal.getState()
          temporalApi.pause()
          const target = s.graphData[id] ?? { nodes: [], edges: [] }
          const nextData = { ...s.graphData, [s.activeGraphId]: { nodes: s.nodes, edges: s.edges } }
          delete nextData[id]
          queueMicrotask(() => {
            temporalApi.clear()
            temporalApi.resume()
            useUiStore.getState().requestFitView()
          })
          return {
            graphData: nextData,
            nodes: target.nodes,
            edges: target.edges,
            activeGraphId: id,
            selectedNodeId: null,
          }
        }),

      createGroup: (name, nodeIds, options) => {
        const groupId = `group-${Date.now()}`
        set((s) => {
          const idSet = new Set(nodeIds)
          // Scene-level singletons stay in the parent graph rather than being
          // sealed inside a reusable pattern. A surviving MatrixOutput is
          // auto-rewired to the new Group's frame output (it becomes an outgoing
          // boundary edge); a surviving MicInput/MusicLibrary feeding the
          // selection is surfaced as an exposed Group input (an incoming edge).
          // This keeps the "make pattern → group → repeat" loop's sources/output
          // in place for the next pattern.
          for (const n of s.nodes)
            if (idSet.has(n.id) && GROUP_EXCLUDED_TYPES.has(n.data.nodeType as string))
              idSet.delete(n.id)
          const selected = s.nodes.filter((n) => idSet.has(n.id))
          if (selected.length === 0) return s

          const hasFrameOut = (n: StudioNode) =>
            (n.data.outputs as { dataType?: string }[] | undefined)?.some((o) => o.dataType === 'frame')

          const portType = (nodeId: string, portId?: string | null) => {
            const n = selected.find((x) => x.id === nodeId)
            const port = (n?.data.inputs as { id: string; label?: string; dataType?: string }[] | undefined)
              ?.find((pt) => pt.id === portId)
            return { dataType: port?.dataType ?? 'float', label: port?.label ?? portId ?? 'in' }
          }

          // Edges fully inside the selection move into the group.
          const internal = s.edges.filter((e) => idSet.has(e.source!) && idSet.has(e.target!))
          // Edges leaving the selection — their external targets will instead
          // consume the new Group node's frame output.
          const outgoing = s.edges.filter((e) => idSet.has(e.source!) && !idSet.has(e.target!))
          // Edges entering the selection become exposed parameters: an external
          // source feeds a new Group input port, surfaced inside via GroupInput.
          const incoming = s.edges.filter((e) => !idSet.has(e.source!) && idSet.has(e.target!))

          const params = incoming.map((e, i) => {
            const { dataType, label } = portType(e.target!, e.targetHandle)
            return { paramId: `param${i}`, edge: e, dataType, label }
          })

          // The group's terminal frame producer: a selected node feeding an
          // external consumer, else the last selected node with a frame output.
          const terminal =
            selected.find((n) => outgoing.some((e) => e.source === n.id && hasFrameOut(n)))
            ?? [...selected].reverse().find(hasFrameOut)
            ?? selected[selected.length - 1]

          const cx = selected.reduce((a, n) => a + n.position.x, 0) / selected.length
          const cy = selected.reduce((a, n) => a + n.position.y, 0) / selected.length

          const groupOutput: StudioNode = {
            id: `groupout-${groupId}`,
            type: 'studioNode',
            position: { x: 360, y: 160 },
            data: {
              label: 'Group Output', nodeType: 'GroupOutput', category: 'output',
              properties: {}, inputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }], outputs: [],
            },
          } as StudioNode

          // A GroupInput node inside the subgraph for each exposed parameter,
          // wired to the internal consumer the boundary edge used to feed.
          const groupInputNodes = params.map((pm, i) => ({
            id: `groupin-${groupId}-${i}`,
            type: 'studioNode',
            position: { x: 40, y: 80 + i * 80 },
            data: {
              label: pm.label, nodeType: 'GroupInput', category: 'composite',
              properties: { paramId: pm.paramId },
              inputs: [], outputs: [{ id: 'out', label: pm.label, dataType: pm.dataType }],
            },
          } as StudioNode))
          const inputEdges = params.map((pm, i) => ({
            id: `e-${groupId}-in${i}`, source: groupInputNodes[i].id, sourceHandle: 'out',
            target: pm.edge.target!, targetHandle: pm.edge.targetHandle,
          } as StudioEdge))

          // ── Auto-expose speed/energy/palette as show-input roles ──────────
          // A node's `speed`/`energy`/`paletteIn` port already falls back to its
          // own property when unwired (same mechanism the GroupInput role system
          // uses), so wiring one in here is dormant until a PerformanceGenerator
          // with "use group inputs" actually drives it — the pattern behaves
          // exactly as authored otherwise.
          const isPortFree = (nodeId: string, portId: string) =>
            !s.edges.some((e) => e.target === nodeId && e.targetHandle === portId)

          const roleInputNodes: StudioNode[] = []
          const roleEdges: StudioEdge[] = []
          const roleInputId: Partial<Record<'speed' | 'energy' | 'palette', string>> = {}
          let roleY = 40

          const ensureRoleInput = (role: 'speed' | 'energy' | 'palette', dataType: 'float' | 'palette') => {
            const existing = roleInputId[role]
            if (existing) return existing
            const id = `groupin-${groupId}-${role}`
            roleInputNodes.push({
              id,
              type: 'studioNode',
              position: { x: -180, y: roleY },
              data: {
                label: role[0].toUpperCase() + role.slice(1), nodeType: 'GroupInput', category: 'composite',
                properties: { paramId: role },
                inputs: [], outputs: [{ id: 'out', label: role, dataType }],
              },
            } as unknown as StudioNode)
            roleY += 80
            roleInputId[role] = id
            return id
          }

          // speed/energy: unwired ports get a shared per-role GroupInput
          // multiplied against the node's own slider value, so the section's
          // 0–1 signal scales (never overrides) what the pattern already does.
          for (const role of ['speed', 'energy'] as const) {
            selected
              .filter((n) => (n.data.inputs as { id: string }[] | undefined)?.some((p) => p.id === role))
              .filter((n) => isPortFree(n.id, role))
              .forEach((n, i) => {
                const base = Number((n.data.properties as Record<string, unknown>)[role] ?? 0.5)
                const gi = ensureRoleInput(role, 'float')
                const mulId = `groupmul-${groupId}-${role}-${i}`
                roleInputNodes.push({
                  id: mulId,
                  type: 'studioNode',
                  position: { x: -60, y: n.position.y },
                  data: {
                    label: `${role[0].toUpperCase()}${role.slice(1)} ×`, nodeType: 'Math', category: 'math',
                    properties: { mathOp: 'multiply', a: base, b: 1 },
                    inputs: [
                      { id: 'a', label: 'A', dataType: 'float' },
                      { id: 'b', label: 'B', dataType: 'float' },
                    ],
                    outputs: [{ id: 'result', label: 'Result', dataType: 'float' }],
                  },
                } as unknown as StudioNode)
                roleEdges.push(
                  { id: `e-${mulId}-b`, source: gi, sourceHandle: 'out', target: mulId, targetHandle: 'b' } as StudioEdge,
                  { id: `e-${mulId}-out`, source: mulId, sourceHandle: 'result', target: n.id, targetHandle: role } as StudioEdge,
                )
              })
          }

          // palette: only for nodes the caller opted into (checked in the
          // create-group dialog) — replaces the palette outright rather than
          // multiplying, since palettes aren't numeric.
          for (const nodeId of options?.exposePaletteNodeIds ?? []) {
            const target = selected.find((n) => n.id === nodeId)
            if (!target) continue
            const hasPort = (target.data.inputs as { id: string }[] | undefined)?.some((p) => p.id === 'paletteIn')
            if (!hasPort || !isPortFree(nodeId, 'paletteIn')) continue
            const gi = ensureRoleInput('palette', 'palette')
            roleEdges.push({ id: `e-${nodeId}-palette`, source: gi, sourceHandle: 'out', target: nodeId, targetHandle: 'paletteIn' } as StudioEdge)
          }

          const groupSubgraph: GraphContent = {
            nodes: [...selected.map((n) => ({ ...n, selected: false })), ...groupInputNodes, ...roleInputNodes, groupOutput],
            edges: [
              ...internal,
              ...inputEdges,
              ...roleEdges,
              { id: `e-${groupId}-out`, source: terminal.id, sourceHandle: 'frame', target: groupOutput.id, targetHandle: 'frame' } as StudioEdge,
            ],
          }

          const groupNode: StudioNode = {
            id: `groupnode-${groupId}`,
            type: 'studioNode',
            position: { x: cx, y: cy },
            data: {
              label: name, nodeType: 'Group', category: 'composite',
              properties: { groupId },
              inputs: params.map((pm) => ({ id: pm.paramId, label: pm.label, dataType: pm.dataType })),
              outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
            },
          } as StudioNode

          // Rewire external consumers of the selection to the Group node, and
          // external sources of exposed params to the Group's input ports.
          const rewiredOutgoing = outgoing.map((e) => ({
            ...e, source: groupNode.id, sourceHandle: 'frame',
          }))
          const rewiredIncoming = params.map((pm) => ({
            ...pm.edge, target: groupNode.id, targetHandle: pm.paramId,
          }))
          const survivingEdges = s.edges.filter(
            (e) => !idSet.has(e.source!) && !idSet.has(e.target!),
          )

          return {
            nodes: [...s.nodes.filter((n) => !idSet.has(n.id)), groupNode],
            edges: [...survivingEdges, ...rewiredOutgoing, ...rewiredIncoming],
            graphs: { ...s.graphs, [groupId]: { id: groupId, name } },
            graphData: { ...s.graphData, [groupId]: groupSubgraph },
            selectedNodeId: null,
          }
        })
        return groupId
      },

      ungroupNode: (id) => {
        let ungrouped = false
        set((s) => {
          const groupNode = s.nodes.find((n) => n.id === id)
          const groupId = (groupNode?.data.properties as { groupId?: string } | undefined)?.groupId
          const sub = groupId ? s.graphData[groupId] : undefined
          if (!groupNode || studioNodeType(groupNode) !== 'Group' || !groupId || !sub) return s

          const isRestorableNode = (node: StudioNode) => {
            const type = studioNodeType(node)
            if (type === 'GroupInput' || type === 'GroupOutput') return false
            // Auto-exposed speed/energy group roles synthesize helper Math nodes;
            // strip those back out so ungroup restores the authored graph rather
            // than leaking grouping internals onto the canvas.
            if (type === 'Math' && node.id.startsWith('groupmul-')) return false
            return true
          }

          const restorable = sub.nodes.filter(isRestorableNode)
          const anchor = restorable.length ? restorable : [groupNode]
          const cx = anchor.reduce((sum, node) => sum + node.position.x, 0) / anchor.length
          const cy = anchor.reduce((sum, node) => sum + node.position.y, 0) / anchor.length
          const dx = groupNode.position.x - cx
          const dy = groupNode.position.y - cy

          const usedNodeIds = new Set(s.nodes.filter((n) => n.id !== id).map((n) => n.id))
          const nodeIdMap = new Map<string, string>()
          const restoredNodes = restorable.map((node) => {
            const nextId = uniqueId(node.id, usedNodeIds)
            nodeIdMap.set(node.id, nextId)
            return {
              ...node,
              id: nextId,
              position: { x: node.position.x + dx, y: node.position.y + dy },
              selected: false,
            }
          })

          const survivingEdges = s.edges.filter((e) => e.source !== id && e.target !== id)
          const usedEdgeIds = new Set(survivingEdges.map((e) => e.id))
          const emittedEdges: StudioEdge[] = []
          const pushEdge = (edge: StudioEdge) => {
            emittedEdges.push({ ...edge, id: uniqueId(edge.id, usedEdgeIds) })
          }

          // Restore all internal wiring between ordinary nodes verbatim.
          for (const edge of sub.edges) {
            const source = nodeIdMap.get(edge.source ?? '')
            const target = nodeIdMap.get(edge.target ?? '')
            if (!source || !target) continue
            pushEdge({ ...edge, source, target } as StudioEdge)
          }

          // External sources that previously fed the Group node's exposed inputs
          // are wired straight to the old GroupInput consumers inside.
          const exposedInputs = new Set(((groupNode.data.inputs as { id: string }[] | undefined) ?? []).map((port) => port.id))
          for (const groupInput of sub.nodes.filter((node) => studioNodeType(node) === 'GroupInput')) {
            const paramId = String((groupInput.data.properties as { paramId?: string } | undefined)?.paramId ?? '')
            if (!exposedInputs.has(paramId)) continue
            const inbound = s.edges.filter((edge) => edge.target === id && edge.targetHandle === paramId)
            const consumers = sub.edges.filter((edge) => edge.source === groupInput.id)
            for (const outer of inbound) {
              for (const consumer of consumers) {
                const target = nodeIdMap.get(consumer.target ?? '')
                if (!target) continue
                pushEdge({ ...outer, target, targetHandle: consumer.targetHandle } as StudioEdge)
              }
            }
          }

          // The group's frame output becomes the source that used to feed the
          // primary GroupOutput terminal inside the subgraph.
          const groupOutput = sub.nodes.find((node) => studioNodeType(node) === 'GroupOutput')
          const feeder = groupOutput
            ? sub.edges.find((edge) => edge.target === groupOutput.id && edge.targetHandle === 'frame')
            : undefined
          const feederSource = feeder ? nodeIdMap.get(feeder.source ?? '') : undefined
          const feederNode = feederSource ? restoredNodes.find((node) => node.id === feederSource) : undefined
          const feederColor = feeder ? edgeStrokeForPort(feederNode, feeder.sourceHandle ?? undefined) : '#00bfff'
          if (feeder && feederSource) {
            for (const outer of s.edges.filter((edge) => edge.source === id)) {
              pushEdge({
                ...outer,
                source: feederSource,
                sourceHandle: feeder.sourceHandle,
                style: { ...outer.style, stroke: feederColor },
              } as StudioEdge)
            }
          }

          const graphData = { ...s.graphData }
          delete graphData[groupId]
          const graphs = { ...s.graphs }
          delete graphs[groupId]
          ungrouped = true
          return {
            nodes: [...s.nodes.filter((n) => n.id !== id), ...restoredNodes],
            edges: [...survivingEdges, ...emittedEdges],
            graphData,
            graphs,
            selectedNodeId: s.selectedNodeId === id ? null : s.selectedNodeId,
          }
        })
        return ungrouped
      },

      instantiatePattern: (saved, position, centreOnDrop) =>
        set((s) => {
          const groupId = `group-${Date.now()}`
          // Clone the saved subgraph so two instances of the same pattern don't
          // share node/edge objects (editing one would otherwise touch both).
          const sub = structuredClone(saved.subgraph)
          const nodeId = `groupnode-${groupId}`
          if (centreOnDrop) pendingCentreY.set(nodeId, position.y)
          const groupNode: StudioNode = {
            id: nodeId,
            type: 'studioNode',
            position,
            data: {
              label: saved.name, nodeType: 'Group', category: 'composite',
              properties: { groupId },
              inputs: saved.inputs, outputs: saved.outputs,
            },
          } as StudioNode
          return {
            graphs: {
              ...s.graphs,
              [groupId]: { id: groupId, name: saved.name, sourcePatternId: saved.id },
            },
            graphData: { ...s.graphData, [groupId]: { nodes: sub.nodes, edges: sub.edges } },
            nodes: [...s.nodes, groupNode],
          }
        }),

      createCollectionFromPatterns: (savedPatterns, position, properties = {}, centreOnDrop) =>
        set((s) => {
          if (savedPatterns.length === 0) return s

          const def = LIBRARY_DEF.get('PatternCollection')
          if (!def) return s
          const usedGraphIds = new Set(Object.keys(s.graphs))
          const usedNodeIds = new Set(s.nodes.map((n) => n.id))
          const stamp = Date.now()
          const collectionNodeId = uniqueId(`patterncollection-${stamp}`, usedNodeIds)
          if (centreOnDrop) pendingCentreY.set(collectionNodeId, position.y)

          const patternIds: string[] = []
          const graphs = { ...s.graphs }
          const graphData = { ...s.graphData }

          savedPatterns.forEach((saved, index) => {
            const groupId = uniqueId(`group-${stamp + index}`, usedGraphIds)
            const sub = structuredClone(saved.subgraph)
            patternIds.push(groupId)
            graphs[groupId] = { id: groupId, name: saved.name, sourcePatternId: saved.id }
            graphData[groupId] = { nodes: sub.nodes, edges: sub.edges }
          })

          const collectionNode: StudioNode = {
            id: collectionNodeId,
            type: 'studioNode',
            position,
            data: {
              label: def.label,
              nodeType: def.type,
              category: def.category,
              properties: { ...properties, patternIds, patternSections: {} },
              inputs: def.inputs,
              outputs: def.outputs,
            },
          } as StudioNode

          return {
            graphs,
            graphData,
            nodes: [...s.nodes, collectionNode],
          }
        }),

      addToCollection: (collectionNodeId, groupNodeId) =>
        set((s) => {
          const group = s.nodes.find((n) => n.id === groupNodeId)
          const groupId = (group?.data.properties as { groupId?: string } | undefined)?.groupId
          if (!group || !groupId) return s
          // Drop the Group node + any edges touching it; its subgraph stays in
          // graphData, now referenced by the collection's patternIds.
          const nodes = s.nodes
            .filter((n) => n.id !== groupNodeId)
            .map((n) => {
              if (n.id !== collectionNodeId) return n
              const ids = ((n.data.properties as { patternIds?: string[] }).patternIds) ?? []
              if (ids.includes(groupId)) return n
              return { ...n, data: { ...n.data, properties: { ...n.data.properties, patternIds: [...ids, groupId] } } }
            })
          const edges = s.edges.filter((e) => e.source !== groupNodeId && e.target !== groupNodeId)
          return { nodes, edges }
        }),

      addPatternToCollection: (collectionNodeId, saved) =>
        set((s) => {
          const collection = s.nodes.find((n) => n.id === collectionNodeId)
          if (!collection) return s
          const usedGraphIds = new Set(Object.keys(s.graphs))
          const groupId = uniqueId(`group-${Date.now()}`, usedGraphIds)
          const sub = structuredClone(saved.subgraph)
          const nodes = s.nodes.map((n) => {
            if (n.id !== collectionNodeId) return n
            const ids = ((n.data.properties as { patternIds?: string[] }).patternIds) ?? []
            return { ...n, data: { ...n.data, properties: { ...n.data.properties, patternIds: [...ids, groupId] } } }
          })
          return {
            nodes,
            graphs: { ...s.graphs, [groupId]: { id: groupId, name: saved.name, sourcePatternId: saved.id } },
            graphData: { ...s.graphData, [groupId]: { nodes: sub.nodes, edges: sub.edges } },
          }
        }),

      removeFromCollection: (collectionNodeId, groupId) =>
        set((s) => {
          const nodes = s.nodes.map((n) => {
            if (n.id !== collectionNodeId) return n
            const props = n.data.properties as { patternIds?: string[]; patternSections?: Record<string, string[]> }
            const ids = (props.patternIds ?? []).filter((x) => x !== groupId)
            const patternSections = { ...(props.patternSections ?? {}) }; delete patternSections[groupId]
            return { ...n, data: { ...n.data, properties: { ...n.data.properties, patternIds: ids, patternSections } } }
          })
          const graphData = { ...s.graphData }; delete graphData[groupId]
          const graphs = { ...s.graphs }; delete graphs[groupId]
          return { nodes, graphData, graphs }
        }),

      togglePatternSection: (collectionNodeId, groupId, section) =>
        set((s) => {
          const nodes = s.nodes.map((n) => {
            if (n.id !== collectionNodeId) return n
            const props = n.data.properties as { patternSections?: Record<string, string[]> }
            const map = { ...(props.patternSections ?? {}) }
            const cur = map[groupId] ?? []
            const next = cur.includes(section) ? cur.filter((x) => x !== section) : [...cur, section]
            if (next.length === 0) delete map[groupId]
            else map[groupId] = next
            return { ...n, data: { ...n.data, properties: { ...n.data.properties, patternSections: map } } }
          })
          return { nodes }
        }),

      setPatternSections: (collectionNodeId, groupId, sections) =>
        set((s) => {
          const nodes = s.nodes.map((n) => {
            if (n.id !== collectionNodeId) return n
            const props = n.data.properties as { patternSections?: Record<string, string[]> }
            const map = { ...(props.patternSections ?? {}) }
            if (sections.length === 0) delete map[groupId]
            else map[groupId] = sections
            return { ...n, data: { ...n.data, properties: { ...n.data.properties, patternSections: map } } }
          })
          return { nodes }
        }),

      addGroupInput: () =>
        set((s) => {
          // Only meaningful inside a group's subgraph (a GroupInput at the root
          // has nothing to expose to).
          if (s.activeGraphId === ROOT_GRAPH_ID) return s
          const node = {
            id: `groupin-${Date.now()}`,
            type: 'studioNode',
            position: { x: 40, y: 40 + s.nodes.length * 16 },
            data: {
              label: 'Input', nodeType: 'GroupInput', category: 'composite',
              properties: { paramId: 'energy' },   // defaults to a role; change via the node's dropdown
              inputs: [], outputs: [{ id: 'out', label: 'Input', dataType: 'float' }],
            },
          } as unknown as StudioNode
          return { nodes: [...s.nodes, node], selectedNodeId: node.id }
        }),

      setGroupInputRole: (nodeId, role) =>
        set((s) => {
          const target = s.nodes.find((n) => n.id === nodeId)
          if (!target) return s
          const nextType = role === 'palette' ? 'palette' : 'float'
          const prevType = (target.data.outputs as { dataType?: string }[])[0]?.dataType ?? 'float'
          const nodes = s.nodes.map((n) => {
            if (n.id !== nodeId) return n
            const outputs = (n.data.outputs as { id: string; label?: string; dataType?: string }[]).map((o) =>
              o.id === 'out' ? { ...o, dataType: nextType } : o)
            return { ...n, data: { ...n.data, properties: { ...n.data.properties, paramId: role || 'param0' }, outputs } }
          })
          // A palette↔float switch changes what the output can wire into, so drop
          // any now-mismatched noodle from this input's port.
          const edges = nextType !== prevType
            ? s.edges.filter((e) => !(e.source === nodeId && e.sourceHandle === 'out'))
            : s.edges
          return { nodes, edges }
        }),
    }),
    {
      limit: 100,
      // Only track nodes + edges in history — not UI selection state
      partialize: (s): HistorySlice => ({ nodes: s.nodes, edges: s.edges }),
      // Treat states as equal (don't snapshot) while any node is mid-drag
      equality: (past, current) => {
        if (current.nodes.some((n) => n.dragging)) return true
        return past.nodes === current.nodes && past.edges === current.edges
      },
      // A slider drag or a fast typed edit fires updateNodeProperty once per
      // tick/keystroke; debouncing the history-push collapses a whole burst
      // (e.g. one drag gesture) into a single undo step instead of dozens.
      handleSet: (handleSet) => debounceHandleSet(handleSet, 400),
    }
  )
)

// Dev-only: expose the store on window so external tooling (e.g. a browser
// automation session building a demo graph) can call actions like `loadGraph`
// directly, without the localStorage round-trip that a `pagehide` flush can
// clobber. No-op in production builds.
if (import.meta.env.DEV && typeof window !== 'undefined') {
  ;(window as unknown as { useGraphStore?: typeof useGraphStore }).useGraphStore = useGraphStore
}

// Convenience hook for undo/redo state and actions
export const useTemporalStore = <T>(
  selector: (state: TemporalState<HistorySlice>) => T
): T => useStore(useGraphStore.temporal, selector)

// Single-entry cache for the MatrixOutput dimensions: every node's preview
// aspect-ratio selector (and the LED preview) asks for these on every store
// update, so scan the nodes array once per update instead of once per node.
let matrixDimsNodes: StudioNode[] | null = null
let matrixDimsCache = { w: 16, h: 16 }

/** Raw width/height from the MatrixOutput node (16×16 when absent). Memoised
 *  on the nodes array identity — safe to call from per-node store selectors. */
export function matrixDims(nodes: StudioNode[]): { w: number; h: number } {
  if (nodes !== matrixDimsNodes) {
    matrixDimsNodes = nodes
    const output = nodes.find((n) => (n.data as { nodeType?: string }).nodeType === 'MatrixOutput')
    matrixDimsCache = {
      w: Number(output?.data.properties.width ?? 16),
      h: Number(output?.data.properties.height ?? 16),
    }
  }
  return matrixDimsCache
}

let matrixTileLayoutNodes: StudioNode[] | null = null
let matrixTileLayoutCache: { tilesX: number; tilesY: number } | null = null

/** The panel-tile grid from MatrixOutput's `layout`/`tilesX`/`tilesY` props —
 *  null unless `layout === 'panels'` and there's more than one tile, so the
 *  live preview can skip drawing panel-boundary gridlines otherwise. Memoised
 *  like `matrixDims`. Physical wiring order (tile rotation/chain direction,
 *  a custom XY map) has no effect on the rendered content, so it's not
 *  reflected here — see src/state/xyLayout.ts. */
export function matrixTileLayout(nodes: StudioNode[]): { tilesX: number; tilesY: number } | null {
  if (nodes !== matrixTileLayoutNodes) {
    matrixTileLayoutNodes = nodes
    const output = nodes.find((n) => (n.data as { nodeType?: string }).nodeType === 'MatrixOutput')
    const p = output?.data.properties as Record<string, unknown> | undefined
    if (p?.layout === 'panels') {
      const tilesX = Math.max(1, Math.min(16, Math.round(Number(p.tilesX ?? 1)) || 1))
      const tilesY = Math.max(1, Math.min(16, Math.round(Number(p.tilesY ?? 1)) || 1))
      matrixTileLayoutCache = (tilesX > 1 || tilesY > 1) ? { tilesX, tilesY } : null
    } else {
      matrixTileLayoutCache = null
    }
  }
  return matrixTileLayoutCache
}

/**
 * Assemble the group registry the evaluator needs: every non-root graph keyed
 * by id. The active graph lives in `nodes`/`edges`, the rest in `graphData`.
 */
export function getGroupRegistry(): GroupRegistry {
  const s = useGraphStore.getState()
  const reg: GroupRegistry = {}
  for (const [id, data] of Object.entries(s.graphData)) {
    if (id !== ROOT_GRAPH_ID) reg[id] = { nodes: data.nodes, edges: data.edges }
  }
  if (s.activeGraphId !== ROOT_GRAPH_ID) {
    reg[s.activeGraphId] = { nodes: s.nodes, edges: s.edges }
  }
  return reg
}
