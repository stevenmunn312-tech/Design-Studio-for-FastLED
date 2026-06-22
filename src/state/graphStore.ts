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
  clipboard: StudioNode | null
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
}

type HistorySlice = Pick<GraphState, 'nodes' | 'edges'>

export const useGraphStore = create<GraphState>()(
  temporal(
    (set) => ({
      nodes: [],
      edges: [],
      selectedNodeId: null,
      clipboard: null,

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
