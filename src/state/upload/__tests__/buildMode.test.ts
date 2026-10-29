import { describe, expect, it } from 'vitest'
import { BUILD_MODE_LINK_OUT_TYPE, describeBuildMode, musicPlayerSource, resolveBuildMode, type BuildModeEdge, type BuildModeNode } from '../buildMode'
import { BOARD_LINK_OUT_NODE_TYPE } from '../../../build/boardLinks'

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
    // The generator publishes a Display envelope of its own now, so the panels,
    // thumbnails and artwork a performance show carries resolve against it.
    expect([...build.templateDisplaySourceIds!]).toEqual(['performance'])
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

  // A board whose only job is another board's LEDs: an ESP8266 serving a Web
  // Remote. Its partition holds the remote and the link-out, no LED output.
  it('builds a board that only sends over a board link', () => {
    const remote = node('remote', 'WebRemoteInput')
    const send = node('send', BUILD_MODE_LINK_OUT_TYPE)
    const result = resolveBuildMode([remote, send], [
      { source: 'remote', target: 'send', sourceHandle: 'remote:level', targetHandle: 'value' },
    ])
    expect(result.mode).toBe('sketch')
    expect(result.capabilities).toMatchObject({ frameOutput: false, linkSend: true, buildable: true })
    expect(resolveBuildMode([remote], []).capabilities.buildable).toBe(false)
  })

  it('names the link-out type the partition uses', () => {
    expect(BUILD_MODE_LINK_OUT_TYPE).toBe(BOARD_LINK_OUT_NODE_TYPE)
  })
})

describe('Bluetooth music source', () => {
  const graph = (properties: Record<string, unknown>, extra: BuildModeNode[] = []) => ({
    nodes: [node('out', 'MatrixOutput'), node('amp', 'Amplifier'), node('music', 'PatternMaster', properties), ...extra],
    edges: [edge('music', 'out')],
  })

  // The phone is the music source, so a player with no card still builds.
  it('builds a Bluetooth Music Player with an amplifier and no card', () => {
    const { nodes, edges } = graph({ musicSource: 'Bluetooth' })
    const build = resolveBuildMode(nodes, edges)
    expect(build).toMatchObject({ mode: 'player', engineKind: 'music-player', engine: { id: 'music' } })
    expect(describeBuildMode(build).label).toBe('Bluetooth music player')
  })

  it('still needs the amplifier', () => {
    const nodes = [node('out', 'MatrixOutput'), node('music', 'PatternMaster', { musicSource: 'Bluetooth' })]
    expect(resolveBuildMode(nodes, [edge('music', 'out')]).mode).toBe('sketch')
  })

  it('keeps an SD Card source on the card', () => {
    expect(resolveBuildMode(graph({ musicSource: 'SD Card' }).nodes, graph({}).edges).mode).toBe('sketch')
    const withCard = graph({ musicSource: 'SD Card' }, [node('card', 'SDCard')])
    const build = resolveBuildMode(withCard.nodes, withCard.edges)
    expect(build.mode).toBe('player')
    expect(describeBuildMode(build).label).toBe('SD music player')
  })
})

describe('Internet Radio music source', () => {
  // The stations are on the air, so a player with no card still builds.
  it('builds an Internet Radio Music Player with an amplifier and no card', () => {
    const nodes = [node('out', 'MatrixOutput'), node('amp', 'Amplifier'), node('music', 'PatternMaster', { musicSource: 'Internet Radio' })]
    const build = resolveBuildMode(nodes, [edge('music', 'out')])
    expect(build).toMatchObject({ mode: 'player', engineKind: 'music-player', engine: { id: 'music' } })
    expect(describeBuildMode(build).label).toBe('Internet radio player')
    expect(musicPlayerSource(nodes[2])).toBe('Internet Radio')
    expect(musicPlayerSource(node('x', 'PatternMaster', { musicSource: 'Cassette' }))).toBe('SD Card')
  })
})
