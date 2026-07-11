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
  /** Preferred input when this node is dropped onto a compatible noodle. */
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
