import { describe, it, expect, beforeEach } from 'vitest'
import {
  isPatternContentTrusted,
  trustPatternContent,
  patternNeedsTrust,
  clearPatternContentTrustForTests,
} from '../patternTrust'
import type { GraphContent, StudioNode, StudioEdge } from '../graphStore'

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  return {
    id, type: 'studioNode', position: { x: 0, y: 0 },
    data: { label: nodeType, nodeType, category: 'pattern', properties, inputs: [], outputs: [] },
  } as unknown as StudioNode
}
function edge(id: string, source: string, target: string): StudioEdge {
  return { id, source, target, sourceHandle: 'frame', targetHandle: 'frame' } as unknown as StudioEdge
}
const content = (nodes: StudioNode[], edges: StudioEdge[] = []): GraphContent => ({ nodes, edges })

beforeEach(() => clearPatternContentTrustForTests())

describe('patternNeedsTrust', () => {
  it('is false for a pattern built only from ordinary nodes', () => {
    // Nothing here is gated by `trusted`, so it renders identically either way
    // — asking the user would be pure noise.
    expect(patternNeedsTrust(content([
      node('s', 'SolidColor'),
      node('b', 'Blur2D'),
      node('o', 'GroupOutput'),
    ], [edge('e1', 's', 'b'), edge('e2', 'b', 'o')]))).toBe(false)
  })

  it.each(['CustomFormula', 'FieldFormula', 'Code'])('is true for a top-level %s node', (nodeType) => {
    expect(patternNeedsTrust(content([node('x', nodeType), node('o', 'GroupOutput')]))).toBe(true)
  })

  it('is true for a gated node inside a nested group', () => {
    // evaluateGraph forwards `trusted` into subgraphs, so a Code node one group
    // down is gated too and has to count here as well.
    const groups = {
      inner: content([node('cd', 'Code'), node('io', 'GroupOutput')]),
    }
    const subgraph = content([node('g', 'Group', { groupId: 'inner' }), node('o', 'GroupOutput')])
    expect(patternNeedsTrust(subgraph, groups)).toBe(true)
    // …and false without the registry entry: there is nothing resolvable to run.
    expect(patternNeedsTrust(subgraph, {})).toBe(false)
  })

  it('is true for a gated node two groups down', () => {
    const groups = {
      outer: content([node('g2', 'Group', { groupId: 'inner' }), node('oo', 'GroupOutput')]),
      inner: content([node('cf', 'CustomFormula'), node('io', 'GroupOutput')]),
    }
    expect(patternNeedsTrust(content([node('g', 'Group', { groupId: 'outer' })]), groups)).toBe(true)
  })

  it('terminates on a self-referencing group', () => {
    const groups = { loop: content([node('g', 'Group', { groupId: 'loop' })]) }
    expect(patternNeedsTrust(content([node('g0', 'Group', { groupId: 'loop' })]), groups)).toBe(false)
  })

  it('ignores a Group node with no resolvable group id', () => {
    expect(patternNeedsTrust(content([node('g', 'Group', {})]), {})).toBe(false)
  })
})

describe('pattern content trust store', () => {
  const subgraph = content([node('cf', 'CustomFormula', { formula: '0.5' }), node('o', 'GroupOutput')])

  it('remembers a trusted subgraph by content', () => {
    expect(isPatternContentTrusted(subgraph)).toBe(false)
    trustPatternContent(subgraph)
    expect(isPatternContentTrusted(subgraph)).toBe(true)
  })

  it('does not carry trust over to an edited copy', () => {
    trustPatternContent(subgraph)
    const edited = content([node('cf', 'CustomFormula', { formula: '0.9' }), node('o', 'GroupOutput')])
    expect(isPatternContentTrusted(edited)).toBe(false)
  })
})
