import { beforeEach, describe, expect, it } from 'vitest'
import { insertMapRangeOnEdge, useGraphStore, type StudioEdge, type StudioNode } from '../graphStore'
import { NODE_LIBRARY, libraryDefaults } from '../nodeLibrary'

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  const def = NODE_LIBRARY.find((entry) => entry.type === nodeType)!
  return { id, type: 'studioNode', position: { x: 0, y: 0 }, data: {
    label: def.label, nodeType, category: def.category,
    properties: { ...libraryDefaults(nodeType), ...properties },
    inputs: def.inputs, outputs: def.outputs,
  } } as unknown as StudioNode
}

/*
 * Graph Health names the repair for a 0-1 signal landing in another domain.
 * This is the same repair performed: a plain splice with the four bounds
 * already filled in, so the user is not left to place the node, wire it twice
 * and retype numbers the diagnostic had already worked out.
 */
describe('insertMapRangeOnEdge', () => {
  const wire = {
    id: 'w', source: 'fft', sourceHandle: 'bass', target: 'fire', targetHandle: 'sparking',
  } as unknown as StudioEdge

  beforeEach(() => {
    useGraphStore.getState().loadGraph([node('fft', 'FFTAnalyzer'), node('fire', 'Fire2012')], [wire])
  })

  it('splices a configured Map Range onto the wire', () => {
    expect(insertMapRangeOnEdge('w', 0, 255)).toBe(true)

    const state = useGraphStore.getState()
    const mapRange = state.nodes.find((entry) => entry.data.nodeType === 'MapRange')!
    expect(mapRange).toBeTruthy()
    expect(mapRange.data.properties).toMatchObject({ inMin: 0, inMax: 1, outMin: 0, outMax: 255 })

    // The old wire is gone and the signal now runs through the new node.
    expect(state.edges.some((edge) => edge.id === 'w')).toBe(false)
    expect(state.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: 'fft', sourceHandle: 'bass', target: mapRange.id, targetHandle: 'value' }),
      expect.objectContaining({ source: mapRange.id, sourceHandle: 'result', target: 'fire', targetHandle: 'sparking' }),
    ]))
  })

  it('reports rather than guesses when the wire has since gone', () => {
    useGraphStore.getState().removeEdge('w')
    expect(insertMapRangeOnEdge('w', 0, 255)).toBe(false)
    expect(useGraphStore.getState().nodes.some((entry) => entry.data.nodeType === 'MapRange')).toBe(false)
  })
})
