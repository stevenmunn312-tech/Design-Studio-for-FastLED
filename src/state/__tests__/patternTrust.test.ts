import { describe, it, expect, beforeEach } from 'vitest'
import {
  isPatternContentTrusted,
  trustPatternContent,
  patternNeedsTrust,
  workspaceNeedsTrust,
  workspaceTrustHolds,
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

describe('workspaceTrustHolds', () => {
  it('holds nothing for a workspace of ordinary nodes', () => {
    // The common shape of a shared pattern. Until 2026-08-14 the banner warned
    // about Formula and Code logic that isn't here, which is how a security
    // affordance teaches people to dismiss it unread.
    const holds = workspaceTrustHolds([
      node('p', 'Plasma'),
      node('b', 'Blur2D'),
      node('o', 'MatrixOutput'),
    ])
    expect(holds).toEqual({ formulaOrCode: false, artnet: false })
    expect(workspaceNeedsTrust([node('p', 'Plasma'), node('o', 'MatrixOutput')])).toBe(false)
  })

  it.each(['CustomFormula', 'FieldFormula', 'Code'])('reports %s in the active graph', (nodeType) => {
    const holds = workspaceTrustHolds([node('x', nodeType), node('o', 'MatrixOutput')])
    expect(holds.formulaOrCode).toBe(true)
    expect(holds.artnet).toBe(false)
  })

  it('finds gated content inside a group subgraph, not just the active graph', () => {
    // A Group's nodes live in graphData; evaluateGraph forwards `trusted` into
    // them, so a formula one level down is blocked and must still be reported.
    const holds = workspaceTrustHolds(
      [node('g', 'Group', { groupId: 'grp' }), node('o', 'MatrixOutput')],
      { grp: content([node('cf', 'CustomFormula'), node('go', 'GroupOutput')]) },
    )
    expect(holds.formulaOrCode).toBe(true)
  })

  it('reports an Art-Net DMX input, whose listener is held until trusted', () => {
    const holds = workspaceTrustHolds([node('d', 'DMXInput', { inputMode: 'Art-Net' })])
    expect(holds).toEqual({ formulaOrCode: false, artnet: true })
  })

  it('defaults a DMX input with no explicit mode to Art-Net', () => {
    expect(workspaceTrustHolds([node('d', 'DMXInput')]).artnet).toBe(true)
  })

  it('ignores a DMX512 input, which opens no listener in preview', () => {
    // DmxInputBody returns early for any non-Art-Net mode, so trusting changes
    // nothing for it and there is nothing to warn about.
    expect(workspaceTrustHolds([node('d', 'DMXInput', { inputMode: 'DMX512' })]).artnet).toBe(false)
  })

  it('reports both kinds together', () => {
    const holds = workspaceTrustHolds([
      node('cf', 'CustomFormula'),
      node('d', 'DMXInput', { inputMode: 'Art-Net' }),
    ])
    expect(holds).toEqual({ formulaOrCode: true, artnet: true })
  })

  it('keeps the workspace and pattern node sets distinct', () => {
    // A pattern's DMXInput can never open a socket — the critic renders saved
    // subgraphs without mounting node bodies — so it must not make a scan
    // interrupt the user, even though it does justify the workspace banner.
    const dmx = content([node('d', 'DMXInput', { inputMode: 'Art-Net' })])
    expect(patternNeedsTrust(dmx)).toBe(false)
    expect(workspaceNeedsTrust(dmx.nodes)).toBe(true)
  })
})
