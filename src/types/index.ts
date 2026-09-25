export type NodeCategory =
  | 'input' | 'audio' | 'signal' | 'math' | 'color' | 'pattern' | 'field'
  | 'composite' | 'show' | 'output' | 'note'

export interface NodePort {
  id: string
  label: string
  dataType: string
  /** A screen control a template stamped with a role, which the Touch node's
   *  one Controls wire already carries. The node hides it unless something is
   *  wired to it directly, so a template's controls do not arrive as a row of
   *  outputs asking to be connected one by one. */
  carriedByControls?: boolean
}

export interface NodeDefinition {
  type: string
  label: string
  category: NodeCategory
  /** Sidebar sub-heading within the category (see SUBCATEGORY_ORDER in nodeLibrary). */
  subcategory?: string
  inputs: NodePort[]
  outputs: NodePort[]
  /** Verified runtime property -> existing input id. Unlisted inputs stay visible. */
  propertyInputs?: Record<string, string>
  /** Optional action/control input ids shown on demand like property inputs. */
  actionInputs?: string[]
  /** Property inputs shown before the user chooses an exposure list. */
  defaultExposedInputs?: string[]
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
