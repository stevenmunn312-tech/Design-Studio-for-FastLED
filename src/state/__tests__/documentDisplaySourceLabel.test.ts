import { describe, expect, it } from 'vitest'
import { documentDisplaySourceLabel } from '../mountedDisplays'
import { NODE_LIBRARY, libraryDefaults } from '../nodeLibrary'
import type { StudioEdge, StudioNode } from '../graphStore'

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  const definition = NODE_LIBRARY.find((entry) => entry.type === nodeType)!
  return {
    id,
    type: 'studioNode',
    position: { x: 0, y: 0 },
    data: {
      // What a load leaves behind: the library's default, not the shown title.
      label: definition.label,
      nodeType,
      category: definition.category,
      properties: { ...libraryDefaults(nodeType), ...properties },
      inputs: definition.inputs,
      outputs: definition.outputs,
    },
  } as unknown as StudioNode
}

/*
 * The designer names the panel's source beside the templates it suits, so it
 * must use the title the canvas shows. Nothing persists `data.label`, so
 * reading it named an LED String "LED Matrix".
 */
describe('documentDisplaySourceLabel', () => {
  it('names an LED output by its form, as the canvas does', () => {
    const nodes = [
      node('out', 'MatrixOutput', { form: 'strip' }),
      node('tft', 'TransportDisplay', { tftLayout: 'Custom design', displayId: 'screen' }),
    ]
    const edges = [
      { id: 'e', source: 'out', sourceHandle: 'display', target: 'tft', targetHandle: 'display' },
    ] as StudioEdge[]
    expect(documentDisplaySourceLabel('screen', nodes, edges)).toBe('LED String')
  })
})
