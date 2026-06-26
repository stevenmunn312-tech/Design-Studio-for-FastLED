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
import { CATEGORY_COLOR } from './nodeLibrary'
import type { GroupRegistry } from './graphEvaluator'
import type { SavedPattern } from './patternLibrary'

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

interface GraphMeta { id: string; name: string }
interface GraphContent { nodes: StudioNode[]; edges: StudioEdge[] }

interface GraphState {
  // The active graph being edited. Kept at the top level so every existing
  // consumer (`s.nodes`, `s.edges`) and action is unchanged.
  nodes: StudioNode[]
  edges: StudioEdge[]
  selectedNodeId: string | null
  clipboard: StudioNode | null

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
  addNode: (node: StudioNode) => void
  /** Drop-to-splice: insert a node onto an existing edge, rewiring it as
   *  source → node → target (then spread the area so the noodles aren't tiny). */
  insertNodeOnEdge: (node: StudioNode, edgeId: string, inHandle: string, outHandle: string) => void
  /** Push connected nodes apart so no noodle is uncomfortably short. Only ever
   *  moves nodes rightward, so it tidies a cramped area without disturbing a
   *  layout that already has room. */
  spreadNodes: () => void
  selectNode: (id: string | null) => void
  selectAllNodes: () => void
  updateNodeProperty: (id: string, key: string, value: unknown) => void
  updateNodeProperties: (id: string, updates: Record<string, unknown>) => void
  loadGraph: (nodes: StudioNode[], edges: StudioEdge[]) => void
  duplicateNode: (id: string) => void
  copyNode: (id: string) => void
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
  createGroup: (name: string, nodeIds: string[]) => string
  /** Drop a copy of a saved library pattern onto the canvas as a Group node,
   *  registering its subgraph under a fresh group id. */
  instantiatePattern: (saved: SavedPattern, position: { x: number; y: number }) => void
  /** Absorb a Group node into a PatternCollection: remove it (and its edges)
   *  from the canvas and record its group id in the collection's list. */
  addToCollection: (collectionNodeId: string, groupNodeId: string) => void
  /** Remove a pattern (group id) from a PatternCollection, dropping its subgraph. */
  removeFromCollection: (collectionNodeId: string, groupId: string) => void
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

const LEGACY_BUNDLE: Record<string, { nodeType: string; label: string; props: Record<string, unknown> }> = {
  NoiseField:    { nodeType: 'Noise', label: 'Noise', props: { noiseType: 'field' } },
  Simplex2D:     { nodeType: 'Noise', label: 'Noise', props: { noiseType: 'simplex' } },
  Noise3D:       { nodeType: 'Noise', label: 'Noise', props: { noiseType: 'noise3d' } },
  Worley:        { nodeType: 'Noise', label: 'Noise', props: { noiseType: 'worley' } },
  PlasmaFractal: { nodeType: 'Noise', label: 'Noise', props: { noiseType: 'plasma' } },
  MathAdd:       { nodeType: 'Math', label: 'Math', props: { mathOp: 'add' } },
  Multiply:      { nodeType: 'Math', label: 'Math', props: { mathOp: 'multiply' } },
  MinNode:       { nodeType: 'Math', label: 'Math', props: { mathOp: 'min' } },
  MaxNode:       { nodeType: 'Math', label: 'Math', props: { mathOp: 'max' } },
  Crossfade:     { nodeType: 'Transition', label: 'Transition', props: { transitionType: 'crossfade' } },
  Wipe:          { nodeType: 'Transition', label: 'Transition', props: { transitionType: 'wipe' } },
  Dissolve:      { nodeType: 'Transition', label: 'Transition', props: { transitionType: 'dissolve' } },
  // Both old blend nodes did a linear mix → the Blend node's `normal` mode.
  // LayerBlend used a 0–255 `amount`; migrateLegacyGraph rescales it to 0–1.
  LayerBlend:    { nodeType: 'Blend', label: 'Blend', props: { blendMode: 'normal' } },
  BlendFrames:   { nodeType: 'Blend', label: 'Blend', props: { blendMode: 'normal' } },
}

// Migrate a saved graph's legacy node types to their bundle, fixing up edge
// handles where a port was renamed (BlendFrames' `t` → Blend's `amount`) and
// rescaling the old 0–255 `amount` opacity to the new 0–1 range.
function migrateLegacyGraph(nodes: StudioNode[], edges: StudioEdge[]): { nodes: StudioNode[]; edges: StudioEdge[] } {
  const handleRenames = new Map<string, Record<string, string>>()
  const migratedNodes = nodes.map((n) => {
    const data = n.data as StudioNodeData
    const bundle = LEGACY_BUNDLE[data?.nodeType]
    let nodeType = data.nodeType
    let label = data.label
    // Existing props win, so a migrated Wipe keeps its `direction`.
    let properties: Record<string, unknown> = bundle
      ? { ...bundle.props, ...data.properties }
      : { ...data.properties }
    if (bundle) {
      nodeType = bundle.nodeType
      label = bundle.label
      // BlendFrames' 0–1 `t` becomes Blend's `amount` (also 0–1 since the
      // amount scale moved to 0–1); the port is renamed t → amount.
      if (data.nodeType === 'BlendFrames') {
        const { t, ...rest } = data.properties as Record<string, unknown>
        properties = { ...bundle.props, ...rest, amount: Number(t ?? 0.5) }
        handleRenames.set(n.id, { t: 'amount' })
      }
    }
    // `amount` moved from a 0–255 opacity to a normalised 0–1 value. Older
    // graphs (and the legacy LayerBlend) stored it 0–255 — anything above 1 must
    // be on the old scale, so rescale it.
    if (
      (nodeType === 'Blend' || nodeType === 'Blur2D' || nodeType === 'PaletteBlend') &&
      typeof properties.amount === 'number' && properties.amount > 1
    ) {
      properties = { ...properties, amount: properties.amount / 255 }
    }
    return { ...n, data: { ...data, nodeType, label, properties } }
  })
  const migratedEdges = edges.map((e) => {
    const rename = handleRenames.get(e.target)
    if (rename && e.targetHandle && rename[e.targetHandle]) return { ...e, targetHandle: rename[e.targetHandle] }
    return e
  })
  return { nodes: migratedNodes, edges: migratedEdges }
}

// Minimum horizontal clearance to keep between a node's right edge and the left
// edge of a node it feeds — anything tighter makes for a cramped, stubby noodle.
const MIN_NODE_GAP = 60
const DEFAULT_NODE_W = 180
const DEFAULT_NODE_H = 100

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
        set((s) => ({ nodes: applyNodeChanges(changes, s.nodes) as StudioNode[] })),

      onEdgesChange: (changes) =>
        set((s) => ({ edges: applyEdgeChanges(changes, s.edges) })),

      onConnect: (connection) =>
        set((s) => {
          const src = s.nodes.find((n) => n.id === connection.source)
          const color = CATEGORY_COLOR[(src?.data as { category?: string })?.category ?? ''] ?? '#00bfff'
          // `reconnectable: 'target'` lets a noodle be unplugged/re-routed from
          // the input (target) end only — grab it at the input port and drag.
          return { edges: addEdge({ ...connection, type: 'glowEdge', reconnectable: 'target', style: { stroke: color } }, s.edges) }
        }),

      removeEdge: (id) =>
        set((s) => ({ edges: s.edges.filter((e) => e.id !== id) })),

      reconnectNoodle: (oldEdge, newConnection) =>
        set((s) => ({ edges: reconnectEdge(oldEdge, newConnection, s.edges) })),

      addNode: (node) =>
        set((s) => ({ nodes: [...s.nodes, node] })),

      insertNodeOnEdge: (node, edgeId, inHandle, outHandle) =>
        set((s) => {
          const old = s.edges.find((e) => e.id === edgeId)
          if (!old) return { nodes: [...s.nodes, node] }
          const srcNode = s.nodes.find((n) => n.id === old.source)
          const srcColor = CATEGORY_COLOR[(srcNode?.data as { category?: string })?.category ?? ''] ?? '#00bfff'
          const newColor = CATEGORY_COLOR[node.data.category] ?? '#00bfff'
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

      spreadNodes: () =>
        set((s) => ({ nodes: spreadNodesByEdges(s.nodes, s.edges) })),

      selectNode: (id) => set({ selectedNodeId: id }),

      selectAllNodes: () =>
        set((s) => ({ nodes: s.nodes.map((n) => ({ ...n, selected: true })) })),

      copyNode: (id) =>
        set((s) => ({ clipboard: s.nodes.find((n) => n.id === id) ?? s.clipboard })),

      pasteNode: (position) =>
        set((s) => {
          if (!s.clipboard) return s
          const node = s.clipboard
          return {
            nodes: [...s.nodes, {
              ...node,
              id: `${node.data.nodeType}-${Date.now()}`,
              position,
              selected: false,
            }],
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

      loadGraph: (nodes, edges) => set(migrateLegacyGraph(nodes, edges)),

      duplicateNode: (id) =>
        set((s) => {
          const node = s.nodes.find((n) => n.id === id)
          if (!node) return s
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
          queueMicrotask(() => { temporalApi.clear(); temporalApi.resume() })
          return {
            graphData: nextData,
            nodes: target.nodes,
            edges: target.edges,
            activeGraphId: id,
            selectedNodeId: null,
          }
        }),

      createGroup: (name, nodeIds) => {
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

          const groupSubgraph: GraphContent = {
            nodes: [...selected.map((n) => ({ ...n, selected: false })), ...groupInputNodes, groupOutput],
            edges: [
              ...internal,
              ...inputEdges,
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

      instantiatePattern: (saved, position) =>
        set((s) => {
          const groupId = `group-${Date.now()}`
          // Clone the saved subgraph so two instances of the same pattern don't
          // share node/edge objects (editing one would otherwise touch both).
          const sub = structuredClone(saved.subgraph)
          const groupNode: StudioNode = {
            id: `groupnode-${groupId}`,
            type: 'studioNode',
            position,
            data: {
              label: saved.name, nodeType: 'Group', category: 'composite',
              properties: { groupId },
              inputs: saved.inputs, outputs: saved.outputs,
            },
          } as StudioNode
          return {
            graphs: { ...s.graphs, [groupId]: { id: groupId, name: saved.name } },
            graphData: { ...s.graphData, [groupId]: { nodes: sub.nodes, edges: sub.edges } },
            nodes: [...s.nodes, groupNode],
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

      removeFromCollection: (collectionNodeId, groupId) =>
        set((s) => {
          const nodes = s.nodes.map((n) => {
            if (n.id !== collectionNodeId) return n
            const ids = (((n.data.properties as { patternIds?: string[] }).patternIds) ?? []).filter((x) => x !== groupId)
            return { ...n, data: { ...n.data, properties: { ...n.data.properties, patternIds: ids } } }
          })
          const graphData = { ...s.graphData }; delete graphData[groupId]
          const graphs = { ...s.graphs }; delete graphs[groupId]
          return { nodes, graphData, graphs }
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
    }
  )
)

// Convenience hook for undo/redo state and actions
export const useTemporalStore = <T>(
  selector: (state: TemporalState<HistorySlice>) => T
): T => useStore(useGraphStore.temporal, selector)

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
