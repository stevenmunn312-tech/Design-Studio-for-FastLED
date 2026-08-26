import { describe, it, expect } from 'vitest'
import { findDisplayGeneratorIssues } from '../validateGraph'
import { NODE_LIBRARY } from '../../state/nodeLibrary'
import type { StudioNode, StudioEdge } from '../../state/graphStore'

function node(id: string, nodeType: string, props: Record<string, unknown> = {}): StudioNode {
  const def = NODE_LIBRARY.find((n) => n.type === nodeType)
  return {
    id, type: 'studioNode', position: { x: 0, y: 0 },
    data: {
      label: def?.label ?? nodeType, nodeType, category: def?.category ?? 'output', properties: props,
      inputs: def?.inputs ?? [], outputs: def?.outputs ?? [],
    },
  } as unknown as StudioNode
}
function edge(id: string, s: string, sh: string, t: string, th: string): StudioEdge {
  return { id, source: s, target: t, sourceHandle: sh, targetHandle: th } as unknown as StudioEdge
}

const oled = () => node('oled', 'InfoDisplay', { partId: 'sh1106-oled-128x64', infoLayout: 'Now Playing' })
const out = () => node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 4 })

/*
 * A build that succeeds and leaves the panel dark is the worst outcome: the
 * first thing anyone does is doubt their wiring, and the wiring is fine.
 */
describe('displays a build cannot drive', () => {
  it('says nothing when there is no display', () => {
    expect(findDisplayGeneratorIssues([out()], [])).toEqual({ errors: [], warnings: [] })
  })

  it('says nothing about a display in a plain sketch', () => {
    expect(findDisplayGeneratorIssues([out(), oled()], [])).toEqual({ errors: [], warnings: [] })
  })

  // The show-controller sketch has no display support at all, so the part would
  // be dropped from the firmware entirely.
  it('blocks a display when a show controller drives the output', () => {
    const nodes = [out(), oled(), node('pg', 'PerformanceGenerator')]
    const issues = findDisplayGeneratorIssues(nodes, [edge('e', 'pg', 'frame', 'out', 'frame')])
    expect(issues.errors).toHaveLength(1)
    expect(issues.errors[0]).toContain('Info Display')
    expect(issues.errors[0]).toContain('would not be built into the firmware')
  })

  it('leaves an unwired show controller alone', () => {
    const nodes = [out(), oled(), node('pg', 'PerformanceGenerator')]
    expect(findDisplayGeneratorIssues(nodes, []).errors).toEqual([])
  })

  it('accepts a display fed from the Music Player', () => {
    const nodes = [out(), oled(), node('master', 'PatternMaster')]
    const wires = [
      edge('e1', 'master', 'frame', 'out', 'frame'),
      edge('e2', 'master', 'title', 'oled', 'title'),
      edge('e3', 'master', 'progress', 'oled', 'progress'),
    ]
    expect(findDisplayGeneratorIssues(nodes, wires)).toEqual({ errors: [], warnings: [] })
  })

  // The player sketch is a template, not a compiled graph. A Wave is a perfectly
  // reasonable wire on the canvas and has no value to read there.
  it('warns about a port the player sketch cannot read', () => {
    const nodes = [out(), oled(), node('master', 'PatternMaster'), node('w', 'Wave')]
    const wires = [
      edge('e1', 'master', 'frame', 'out', 'frame'),
      edge('e2', 'w', 'result', 'oled', 'progress'),
    ]
    const issues = findDisplayGeneratorIssues(nodes, wires)
    expect(issues.errors).toEqual([])
    expect(issues.warnings).toHaveLength(1)
    expect(issues.warnings[0]).toContain('progress')
    expect(issues.warnings[0]).toContain('Wave')
    expect(issues.warnings[0]).toContain('stays blank')
  })

  it('names every unreadable port rather than only the first', () => {
    const nodes = [out(), oled(), node('master', 'PatternMaster'), node('w', 'Wave')]
    const wires = [
      edge('e1', 'master', 'frame', 'out', 'frame'),
      edge('e2', 'w', 'result', 'oled', 'progress'),
      edge('e3', 'w', 'result', 'oled', 'value'),
    ]
    expect(findDisplayGeneratorIssues(nodes, wires).warnings).toHaveLength(2)
  })

  it('covers a segment display too', () => {
    const seg = node('seg', 'SegmentDisplay', { partId: 'tm1637-4digit-display' })
    const nodes = [out(), seg, node('pg', 'PerformanceGenerator')]
    const issues = findDisplayGeneratorIssues(nodes, [edge('e', 'pg', 'frame', 'out', 'frame')])
    expect(issues.errors[0]).toContain('Segment Display')
  })
})
