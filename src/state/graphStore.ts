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
} from '@xyflow/react'
import type { NodeCategory } from '../types'
import { CATEGORY_COLOR } from './nodeLibrary'
import type { GroupRegistry } from './graphEvaluator'

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

  /** Switch the active graph, stashing the current one. */
  enterGraph: (id: string) => void
  /** Encapsulate the given nodes into a new group, replacing them in the
   *  active graph with a single Group node. Returns the new group id. */
  createGroup: (name: string, nodeIds: string[]) => string
}

type HistorySlice = Pick<GraphState, 'nodes' | 'edges'>

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
          return { edges: addEdge({ ...connection, type: 'glowEdge', style: { stroke: color } }, s.edges) }
        }),

      addNode: (node) =>
        set((s) => ({ nodes: [...s.nodes, node] })),

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

      loadGraph: (nodes, edges) => set({ nodes, edges }),

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
