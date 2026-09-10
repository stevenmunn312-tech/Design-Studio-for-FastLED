import { describe, expect, it } from 'vitest'
import { resolveBuildMode, type BuildModeEdge, type BuildModeNode } from '../buildMode'

const node = (id: string, nodeType: string, properties: Record<string, unknown> = {}): BuildModeNode => ({
  id,
  data: { nodeType, properties },
})

const edge = (source: string, target: string, sourceHandle = 'frame', targetHandle = 'frame'): BuildModeEdge => ({
  source,
  target,
  sourceHandle,
  targetHandle,
})

describe('build mode resolution', () => {
  it('leaves disconnected engines and a lone SD card on the normal sketch', () => {
    const nodes = [
      node('out', 'MatrixOutput'),
      node('card', 'SDCard'),
      node('amp', 'Amplifier'),
      node('music', 'PatternMaster'),
      node('performance', 'PerformanceGenerator'),
      node('slideshow', 'PatternSlideshow'),
      node('collection', 'PatternCollection'),
    ]
    const build = resolveBuildMode(nodes, [edge('collection', 'slideshow', 'patternset', 'patternset')])
    expect(build).toMatchObject({
      mode: 'sketch',
      engineKind: 'graph',
      engine: null,
      output: null,
      capabilities: { frameOutput: false, standaloneVuOutput: false, buildable: false },
    })
    expect(build.templateDisplaySourceIds).toBeNull()
  })

  it('selects the connected slideshow when an unrelated Music Player is disconnected', () => {
    const unordered = [
      node('slideshow', 'PatternSlideshow'),
      node('music', 'PatternMaster'),
      node('collection', 'PatternCollection'),
      node('out', 'MatrixOutput'),
      node('card', 'SDCard'),
      node('amp', 'Amplifier'),
    ]
    const edges = [
      edge('collection', 'slideshow', 'patternset', 'patternset'),
      edge('slideshow', 'out'),
    ]
    for (const nodes of [unordered, [...unordered].reverse()]) {
      expect(resolveBuildMode(nodes, edges)).toMatchObject({
        mode: 'show', engineKind: 'pattern-slideshow', engine: { id: 'slideshow' }, output: { id: 'out' },
      })
      expect([...resolveBuildMode(nodes, edges).templateDisplaySourceIds!]).toEqual(['slideshow'])
    }
  })

  it('keeps SD-player precedence when player and slideshow paths coexist', () => {
    const nodes = [
      node('slideshow', 'PatternSlideshow'),
      node('collection', 'PatternCollection'),
      node('showOut', 'MatrixOutput'),
      node('music', 'PatternMaster'),
      node('musicOut', 'MatrixOutput'),
      node('card', 'SDCard'),
      node('amp', 'Amplifier'),
    ]
    const edges = [
      edge('collection', 'slideshow', 'patternset', 'patternset'),
      edge('slideshow', 'showOut'),
      edge('music', 'musicOut'),
    ]
    expect(resolveBuildMode(nodes, edges)).toMatchObject({
      mode: 'player',
      engineKind: 'music-player',
      engine: { id: 'music' },
      output: { id: 'musicOut' },
      capabilities: { fixedTransportControls: true },
    })
    expect([...resolveBuildMode(nodes, edges).templateDisplaySourceIds!]).toEqual(['music'])
  })

  it('selects a connected Performance Generator past a disconnected Music Player', () => {
    const nodes = [
      node('music', 'PatternMaster'),
      node('performance', 'PerformanceGenerator'),
      node('out', 'MatrixOutput'),
      node('card', 'SDCard'),
      node('amp', 'Amplifier'),
    ]
    const build = resolveBuildMode(nodes, [edge('performance', 'out')])
    expect(build).toMatchObject({
      mode: 'player',
      engineKind: 'performance-show',
      engine: { id: 'performance' },
      output: { id: 'out' },
      capabilities: { fixedTransportControls: false },
    })
    expect([...build.templateDisplaySourceIds!]).toEqual([])
  })

  it('preserves a standalone VU as a buildable Music Player output', () => {
    const build = resolveBuildMode([
      node('music', 'PatternMaster'),
      node('card', 'SDCard'),
      node('amp', 'Amplifier'),
      node('vu', 'StereoVuMeter', { enabled: true, targetOutputId: '' }),
    ], [])
    expect(build).toMatchObject({
      mode: 'player',
      engineKind: 'music-player',
      output: null,
      capabilities: { frameOutput: false, standaloneVuOutput: true, buildable: true },
    })
  })

  it('treats a wired display as a complete standalone build', () => {
    const build = resolveBuildMode([
      node('rtc', 'RTCInput'),
      node('panel', 'TransportDisplay', { enabled: true }),
    ], [edge('rtc', 'panel', 'display', 'display')])

    expect(build).toMatchObject({
      mode: 'sketch',
      capabilities: {
        frameOutput: false,
        standaloneVuOutput: false,
        standaloneDisplayOutput: true,
        buildable: true,
      },
    })
  })
})
