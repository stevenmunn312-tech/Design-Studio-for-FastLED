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

export interface StudioNodeData extends Record<string, unknown> {
  label: string
  nodeType: string
  category: NodeCategory
  properties: Record<string, unknown>
}

export type StudioNode = Node<StudioNodeData>
export type StudioEdge = Edge

interface GraphState {
  nodes: StudioNode[]
  edges: StudioEdge[]
  selectedNodeId: string | null
  onNodesChange: (changes: NodeChange[]) => void
  onEdgesChange: (changes: EdgeChange[]) => void
  onConnect: (connection: Connection) => void
  addNode: (node: StudioNode) => void
  selectNode: (id: string | null) => void
  updateNodeProperty: (id: string, key: string, value: unknown) => void
}

type HistorySlice = Pick<GraphState, 'nodes' | 'edges'>

export const useGraphStore = create<GraphState>()(
  temporal(
    (set) => ({
      nodes: [],
      edges: [],
      selectedNodeId: null,

      onNodesChange: (changes) =>
        set((s) => ({ nodes: applyNodeChanges(changes, s.nodes) as StudioNode[] })),

      onEdgesChange: (changes) =>
        set((s) => ({ edges: applyEdgeChanges(changes, s.edges) })),

      onConnect: (connection) =>
        set((s) => ({ edges: addEdge(connection, s.edges) })),

      addNode: (node) =>
        set((s) => ({ nodes: [...s.nodes, node] })),

      selectNode: (id) => set({ selectedNodeId: id }),

      updateNodeProperty: (id, key, value) =>
        set((s) => ({
          nodes: s.nodes.map((n) =>
            n.id === id
              ? { ...n, data: { ...n.data, properties: { ...n.data.properties, [key]: value } } }
              : n
          ),
        })),
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
