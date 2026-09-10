// `hardware` is legacy (split into `input` + `show`); accepted on load and
// migrated to the library's current category in graphStore.loadGraph.
export type NodeCategory =
  | 'input' | 'audio' | 'signal' | 'math' | 'color' | 'pattern' | 'field'
  | 'composite' | 'show' | 'output' | 'hardware' | 'note'

export interface NodePort {
  id: string
  label: string
  dataType: string
}

export interface NodeDefinition {
  type: string
  label: string
  category: NodeCategory
  /** Sidebar sub-heading within the category (see SUBCATEGORY_ORDER in nodeLibrary). */
  subcategory?: string
  inputs: NodePort[]
  outputs: NodePort[]
  /**
   * Which input an existing noodle should land on when this node is dropped
   * onto it, where declaration order does not already answer it.
   *
   * Needed only for peers — Blend's A and B, where one is the layer underneath
   * and the other is what goes over it. A node whose primary input is declared
   * first, which is nearly all of them, needs no declaration: see
   * `spliceTargetPorts` in `state/nodeLibrary.ts`.
   */
  spliceInput?: string
  defaultProperties?: Record<string, unknown>
}

export interface StudioNode {
  id: string
  type: string
  position: { x: number; y: number }
  data: {
    label: string
    category: NodeCategory
    properties: Record<string, unknown>
    inputs: NodePort[]
    outputs: NodePort[]
  }
}

export interface StudioConnection {
  id: string
  from: { node: string; port: string }
  to: { node: string; port: string }
}

export type StatusLevel = 'idle' | 'info' | 'success' | 'error'

export interface StatusMessage {
  level: StatusLevel
  text: string
}
