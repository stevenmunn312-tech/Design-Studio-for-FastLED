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

  // The refusal that used to stand here is gone: a normal sketch draws the
  // colour panel now. The show generator still cannot, which the case below
  // covers along with every other display.
  it('builds a Transport Display into a normal sketch', () => {
    const transport = node('transport', 'TransportDisplay', {
      partId: 'st7789-tft-240x240', tftLayout: 'Now Playing',
    })
    const issues = findDisplayGeneratorIssues([out(), transport], [])
    expect(issues.errors).toEqual([])
    expect(issues.warnings).toEqual([])
  })

  it('rejects an inverted XPT2046 calibration before upload', () => {
    const transport = node('transport', 'TransportDisplay', {
      partId: 'st7789v-xpt2046-touch-240x320', tftLayout: 'Now Playing',
      touchXMin: 3900, touchXMax: 200, touchYMin: 200, touchYMax: 3900,
    })
    const issues = findDisplayGeneratorIssues([out(), transport], [])
    expect(issues.errors).toHaveLength(1)
    expect(issues.errors[0]).toContain('invalid touch calibration')
    expect(issues.errors[0]).toContain('0 and 4095')
  })

  // showGenerator.ts draws no displays, by design, so the refusal is about
  // which generator the graph selected rather than about the panel.
  it('still refuses one on a graph that would export as a show', () => {
    const transport = node('transport', 'TransportDisplay', {
      partId: 'st7789-tft-240x240', tftLayout: 'Now Playing',
    })
    const nodes = [out(), transport, node('pg', 'PerformanceGenerator')]
    const issues = findDisplayGeneratorIssues(nodes, [edge('e', 'pg', 'frame', 'out', 'frame')])
    expect(issues.errors).toHaveLength(1)
    expect(issues.errors[0]).toContain('Transport Display')
    expect(issues.errors[0]).toContain('cannot drive a display')
  })
})

// The hole this check had: it looked only for a Performance Generator, so the
// other show shape — a Music Player fed by a Pattern Collection — fell straight
// through to a build that succeeded with the panel dark. Found on a bench with
// the graph already wired, one step before flashing it.
describe('a Music Player show', () => {
  const master = node('master', 'PatternMaster')
  const collection = node('coll', 'PatternCollection', { patternIds: ['a', 'b'] })
  const out = node('out', 'MatrixOutput')
  const display = node('oled', 'InfoDisplay', { infoLayout: 'Pattern Browser' })

  const showEdges = [
    edge('e1', 'coll', 'patternset', 'master', 'patternset'),
    edge('e2', 'master', 'frame', 'out', 'frame'),
  ]

  it('refuses a display it cannot build', () => {
    const { errors } = findDisplayGeneratorIssues([master, collection, out, display], showEdges)
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('Info Display')
    // Names the way out rather than only the refusal.
    expect(errors[0]).toMatch(/Upload show to SD/)
  })

  it('is quiet when the Music Player has no collection behind it', () => {
    // Without one it is not a show, so it compiles as a normal sketch, which
    // does drive displays.
    const { errors } = findDisplayGeneratorIssues(
      [master, out, display], [edge('e2', 'master', 'frame', 'out', 'frame')])
    expect(errors).toEqual([])
  })

  it('is quiet when the Music Player does not reach an output', () => {
    const { errors } = findDisplayGeneratorIssues(
      [master, collection, out, display], [edge('e1', 'coll', 'patternset', 'master', 'patternset')])
    expect(errors).toEqual([])
  })

  it('is quiet with no display in the graph at all', () => {
    expect(findDisplayGeneratorIssues([master, collection, out], showEdges).errors).toEqual([])
  })

  // The same graph plus an SD card and an amplifier is an SD player build,
  // because sdShowConnected is tested before the show path — and that
  // generator does drive displays. Refusing it would be an error nobody can
  // act on, which teaches people to ignore the drawer.
  it('allows the same shape once it is an SD player build', () => {
    const nodes = [master, collection, out, display,
      node('sd', 'SDCard'), node('amp', 'Amplifier', { model: 'MAX98357A' })]
    expect(findDisplayGeneratorIssues(nodes, showEdges).errors).toEqual([])
  })
})
