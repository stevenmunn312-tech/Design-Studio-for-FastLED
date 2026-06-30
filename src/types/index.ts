export type NodeCategory =
  | 'audio' | 'hardware' | 'math' | 'color' | 'pattern' | 'composite' | 'output' | 'input'

export interface NodePort {
  id: string
  label: string
  dataType: string
}

export interface NodeDefinition {
  type: string
  label: string
  category: NodeCategory
  inputs: NodePort[]
  outputs: NodePort[]
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
