import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
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

export const useGraphStore = create<GraphState>()(
  subscribeWithSelector((set) => ({
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
  }))
)
