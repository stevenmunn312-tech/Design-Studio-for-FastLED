// Graph node definitions: ports, default properties, sidebar
// placement and Help descriptions. src/state/nodeLibrary.ts merges every
// category's definitions into NODE_LIBRARY in sidebar order.
import type { NodeDefinition } from '../../types'

export const GRAPH_DEFINITIONS: NodeDefinition[] = [

  // ── Notes ──────────────────────────────────────────────────────────────
  {
    // A freeform annotation for the canvas — no ports, no evaluation, no
    // codegen. Rendered specially in StudioNode (a resizable textarea; the
    // `color` hex property tints the node itself, not just a swatch).
    type: 'Comment',
    label: 'Comment',
    category: 'note',
    inputs: [],
    outputs: [],
    defaultProperties: { text: 'Note', color: '#ffd24a' },
  },
]

export const GRAPH_DESCRIPTIONS: Record<string, string> = {
  // note
  Comment: 'A sticky note for the canvas — no ports, just text and color.',
}
