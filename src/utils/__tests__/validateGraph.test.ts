import { describe, it, expect } from 'vitest'
import { validateGraph, findPinConflicts } from '../validateGraph'
import type { StudioNode, StudioEdge } from '../../state/graphStore'

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  return {
    id,
    type: 'studioNode',
    position: { x: 0, y: 0 },
    data: { label: nodeType, nodeType, category: 'pattern', properties, inputs: [], outputs: [] },
  } as unknown as StudioNode
}

function edge(id: string, source: string, target: string, th: string): StudioEdge {
  return { id, source, target, sourceHandle: 'frame', targetHandle: th } as unknown as StudioEdge
}

describe('validateGraph', () => {
  it('errors on empty graph', () => {
    const { errors } = validateGraph([], [])
    expect(errors).toContain('No nodes in graph')
  })

  it('errors when MatrixOutput is missing', () => {
    const { errors } = validateGraph([node('sc', 'SolidColor')], [])
    expect(errors).toContain('Missing MatrixOutput node')
  })

  it('errors when MatrixOutput frame input is not connected', () => {
    const { errors } = validateGraph([node('out', 'MatrixOutput')], [])
    expect(errors).toContain('MatrixOutput has no Frame input connected')
  })

  it('passes a valid minimal graph', () => {
    const nodes = [node('sc', 'SolidColor'), node('out', 'MatrixOutput')]
    const edges = [edge('e1', 'sc', 'out', 'frame')]
    const { errors, warnings } = validateGraph(nodes, edges)
    expect(errors).toHaveLength(0)
    expect(warnings).toHaveLength(0)
  })

  it('warns about isolated nodes', () => {
    const nodes = [node('sc', 'SolidColor'), node('out', 'MatrixOutput'), node('iso', 'Plasma')]
    const edges = [edge('e1', 'sc', 'out', 'frame')]
    const { warnings } = validateGraph(nodes, edges)
    expect(warnings.some(w => w.includes('not connected'))).toBe(true)
  })

  it('warns when PatternMaster has no pattern inputs', () => {
    const nodes = [node('pm', 'PatternMaster'), node('out', 'MatrixOutput')]
    const edges = [edge('e1', 'pm', 'out', 'frame')]
    const { warnings } = validateGraph(nodes, edges)
    expect(warnings.some(w => w.includes('Show Engine'))).toBe(true)
  })

  it('does not warn about PatternMaster when a collection is wired', () => {
    const nodes = [node('pc', 'PatternCollection'), node('pm', 'PatternMaster'), node('out', 'MatrixOutput')]
    const edges = [
      edge('e1', 'pc', 'pm', 'patternset'),
      edge('e2', 'pm', 'out', 'frame'),
    ]
    const { warnings } = validateGraph(nodes, edges)
    expect(warnings.some(w => w.includes('Show Engine'))).toBe(false)
  })

  function collection(id: string, patternIds: string[]): StudioNode {
    const n = node(id, 'PatternCollection')
    ;(n.data as unknown as { properties: Record<string, unknown> }).properties = { patternIds }
    return n
  }

  it('warns when a Performance Generator has patterns but no music source', () => {
    const nodes = [collection('pc', ['g1']), node('pg', 'PerformanceGenerator'), node('out', 'MatrixOutput')]
    const edges = [edge('e1', 'pc', 'pg', 'patternset')]
    const { warnings } = validateGraph(nodes, edges)
    expect(warnings.some(w => w.includes('no music source'))).toBe(true)
  })

  it('warns when the wired Pattern Collection is empty', () => {
    const nodes = [collection('pc', []), node('lib', 'MusicLibrary'), node('pg', 'PerformanceGenerator'), node('out', 'MatrixOutput')]
    const edges = [edge('e1', 'pc', 'pg', 'patternset'), edge('e2', 'lib', 'pg', 'music')]
    const { warnings } = validateGraph(nodes, edges)
    expect(warnings.some(w => w.includes('is empty'))).toBe(true)
  })

  it('does not warn when music and a non-empty collection are both wired', () => {
    const nodes = [collection('pc', ['g1']), node('lib', 'MusicLibrary'), node('pg', 'PerformanceGenerator'), node('out', 'MatrixOutput')]
    const edges = [edge('e1', 'pc', 'pg', 'patternset'), edge('e2', 'lib', 'pg', 'music')]
    const { warnings } = validateGraph(nodes, edges)
    expect(warnings.some(w => w.includes('no music source') || w.includes('is empty'))).toBe(false)
  })

  it('counts multiple isolated nodes correctly', () => {
    const nodes = [node('out', 'MatrixOutput'), node('a', 'Plasma'), node('b', 'Fire')]
    const edges: StudioEdge[] = []
    const { warnings } = validateGraph(nodes, edges)
    expect(warnings.some(w => w.includes('2 nodes'))).toBe(true)
  })

  it('does not warn about an unconnected Comment node', () => {
    const nodes = [node('sc', 'SolidColor'), node('out', 'MatrixOutput'), node('note', 'Comment')]
    const edges = [edge('e1', 'sc', 'out', 'frame')]
    const { warnings } = validateGraph(nodes, edges)
    expect(warnings.some(w => w.includes('not connected'))).toBe(false)
  })

  describe('findPinConflicts', () => {
    it('finds no conflicts with distinct pins', () => {
      const nodes = [
        node('out', 'MatrixOutput', { dataPin: 5, chipset: 'WS2812B' }),
        node('sd', 'SDCard', { sdCsPin: 10, i2sBclk: 26, i2sLrc: 25, i2sDout: 22 }),
      ]
      expect(findPinConflicts(nodes)).toHaveLength(0)
    })

    it('flags MatrixOutput data pin colliding with SDCard CS pin', () => {
      const nodes = [
        node('out', 'MatrixOutput', { dataPin: 5 }),
        node('sd', 'SDCard', { sdCsPin: 5 }),
      ]
      const conflicts = findPinConflicts(nodes)
      expect(conflicts).toHaveLength(1)
      expect(conflicts[0]).toContain('GPIO 5')
      expect(conflicts[0]).toContain('data pin')
      expect(conflicts[0]).toContain('CS pin')
    })

    it('flags a node reusing the same pin for two of its own roles', () => {
      const nodes = [node('enc', 'EncoderInput', { pinA: 32, pinB: 32, pinSW: 25 })]
      const conflicts = findPinConflicts(nodes)
      expect(conflicts).toHaveLength(1)
      expect(conflicts[0]).toContain('GPIO 32')
    })

    it('ignores MatrixOutput clock pin for clockless chipsets', () => {
      const nodes = [
        node('out', 'MatrixOutput', { dataPin: 5, clockPin: 34, chipset: 'WS2812B' }),
        node('pot', 'PotInput', { pin: 34 }),
      ]
      expect(findPinConflicts(nodes)).toHaveLength(0)
    })

    it('flags MatrixOutput clock pin colliding for SPI chipsets', () => {
      const nodes = [
        node('out', 'MatrixOutput', { dataPin: 5, clockPin: 34, chipset: 'APA102' }),
        node('pot', 'PotInput', { pin: 34 }),
      ]
      const conflicts = findPinConflicts(nodes)
      expect(conflicts).toHaveLength(1)
      expect(conflicts[0]).toContain('GPIO 34')
    })

    it('surfaces pin conflicts as errors from validateGraph', () => {
      const nodes = [
        node('sc', 'SolidColor'),
        node('out', 'MatrixOutput', { dataPin: 5 }),
        node('btn', 'ButtonInput', { pin: 5 }),
      ]
      const edges = [edge('e1', 'sc', 'out', 'frame')]
      const { errors } = validateGraph(nodes, edges)
      expect(errors.some(e => e.includes('GPIO 5'))).toBe(true)
    })
  })
})
