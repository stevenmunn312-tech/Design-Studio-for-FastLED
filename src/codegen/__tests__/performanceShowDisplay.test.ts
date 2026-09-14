// A Performance Generator is a player, and the sketch it builds proves it.
//
// The generator holds a track off the card exactly as a Music Player does, and
// the firmware behind both is the same SD player sketch. So its `display`
// output resolves against the same panels and the same field table, its
// `controls` input drives the same transport, and the pattern a panel names is
// the one the timed show file scheduled. Each of those reached the sketch
// through a different module that had the Music Player's node type written
// into it by hand; this is what stops any of them being taught only half.

import { describe, expect, it } from 'vitest'
import { buildShowPlayer } from '../../utils/showUpload'
import { resolveBuildMode } from '../../state/buildMode'
import { playerDisplaysFromGraph } from '../playerDisplays'
import { playerControlGraph, PLAYER_SELECTION_STEM } from '../playerControlGraph'
import { playerControlsFromGraph } from '../playerSketchGenerator'
import type { StudioEdge, StudioNode } from '../../state/graphStore'

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  return {
    id, type: 'studioNode', position: { x: 0, y: 0 },
    data: { label: nodeType, nodeType, category: 'show', properties, inputs: [], outputs: [] },
  } as unknown as StudioNode
}

const edge = (id: string, source: string, sourceHandle: string, target: string, targetHandle: string): StudioEdge =>
  ({ id, source, sourceHandle, target, targetHandle }) as unknown as StudioEdge

const GROUPS = Object.fromEntries(['grp-a', 'grp-b'].map((id, i) => [id, {
  nodes: [
    node('sc', 'SolidColor', { r: 0, g: 0, b: (i + 1) * 60 }),
    node('go', 'GroupOutput'),
  ],
  edges: [edge('eg', 'sc', 'frame', 'go', 'frame')],
}]))

/** The starter's shape: music and a collection into the generator, a card and
 * an amplifier on the bench, an OLED on the Display output and a button on a
 * Control Map wired into Controls. */
function performanceShow() {
  const nodes = [
    node('lib', 'MusicLibrary'),
    node('collection', 'PatternCollection', { patternIds: ['grp-a', 'grp-b'] }),
    node('perf', 'PerformanceGenerator', { useGroupInputs: true }),
    node('out', 'MatrixOutput', { width: 8, height: 8, chipset: 'WS2812B', colorOrder: 'GRB', dataPin: 4 }),
    node('card', 'SDCard', {}),
    node('amp', 'Amplifier', {}),
    node('oled', 'InfoDisplay', { partId: 'ssd1306-oled-128x64-i2c', sdaPin: 21, sclPin: 22, i2cAddress: '0x3C' }),
    // A colour panel too: its Now Playing screen names the pattern and draws
    // its artwork, which is what puts the selection cursor in the sketch.
    node('tft', 'TransportDisplay', {
      partId: 'st7789-tft-240x240', tftLayout: 'Now Playing',
      csPin: 5, dcPin: 16, resetPin: 17, sckPin: 18, mosiPin: 23, backlightPin: 4,
    }),
    node('button', 'ButtonInput', { pin: 12, pullup: true }),
    node('controls', 'ControlMap', { controls: ['playPause'] }),
  ]
  const edges = [
    edge('e1', 'lib', 'music', 'perf', 'music'),
    edge('e2', 'collection', 'patternset', 'perf', 'patternset'),
    edge('e3', 'perf', 'frame', 'out', 'frame'),
    edge('e4', 'perf', 'display', 'oled', 'display'),
    edge('e4b', 'perf', 'display', 'tft', 'display'),
    edge('e5', 'button', 'pressed', 'controls', 'playPause'),
    edge('e6', 'controls', 'controls', 'perf', 'controls'),
  ]
  return { nodes, edges }
}

describe('a performance show is an SD player', () => {
  it('selects the generator as the build engine and as its display source', () => {
    const { nodes, edges } = performanceShow()
    const build = resolveBuildMode(nodes, edges)
    expect(build.engineKind).toBe('performance-show')
    // Empty here meant every panel wired to the generator resolved to Waiting.
    expect([...build.templateDisplaySourceIds!]).toEqual(['perf'])
  })

  it('resolves a panel on its Display output to the player layout', () => {
    const { nodes, edges } = performanceShow()
    const build = resolveBuildMode(nodes, edges)
    const displays = playerDisplaysFromGraph(nodes, edges, {
      sourceIds: build.templateDisplaySourceIds ?? undefined,
    })
    expect(displays.unresolved).toEqual([])
    expect(displays.info[0].layout).toBe('Now Playing')
    expect(displays.tft[0].layout).toBe('Now Playing')
    // The track fields come from the generator's own table, not a wire each.
    expect(displays.info[0].sources.title).toBeTruthy()
  })

  it('routes its Controls bundle to the transport and the physical button', () => {
    const { nodes, edges } = performanceShow()
    const routing = playerControlGraph(nodes, edges, undefined, 'perf')
    expect(routing.errors).toEqual([])
    expect(routing.bundle).toBeTruthy()
    expect(playerControlsFromGraph(nodes, edges, 'perf').bindings.playPause)
      .toEqual({ kind: 'button', pin: 12, pullup: true })
  })

  it('follows the show file with the selection cursor a panel reads', () => {
    // The show schedules the patterns, so the cursor has to follow patternId.
    // Left alone it stays at 0 and a browser names the first pattern for the
    // whole song, while the LEDs play something else.
    const { nodes, edges } = performanceShow()
    const build = resolveBuildMode(nodes, edges)
    const sketch = buildShowPlayer(nodes, edges, GROUPS, {
      patternSet: ['grp-a', 'grp-b'], bakedAudio: true, preferredTrack: '',
      genericPlayer: build.engineKind === 'music-player',
    })
    expect(sketch).toContain(`_selSetActive(_sel_${PLAYER_SELECTION_STEM}, PATTERN_COUNT, (uint16_t)patternId);`)
  })
})

describe('a music player is unaffected', () => {
  it('leaves its own rotation the only thing moving the cursor', () => {
    const nodes = [
      node('collection', 'PatternCollection', { patternIds: [] }),
      node('master', 'PatternMaster', {}),
      node('out', 'MatrixOutput', { width: 8, height: 8, chipset: 'WS2812B', colorOrder: 'GRB', dataPin: 4 }),
      node('card', 'SDCard', {}),
      node('amp', 'Amplifier', {}),
      node('oled', 'InfoDisplay', { partId: 'ssd1306-oled-128x64-i2c', sdaPin: 21, sclPin: 22, i2cAddress: '0x3C' }),
    ]
    const edges = [
      edge('e1', 'collection', 'patternset', 'master', 'patternset'),
      edge('e2', 'master', 'frame', 'out', 'frame'),
      edge('e3', 'master', 'display', 'oled', 'display'),
    ]
    expect(resolveBuildMode(nodes, edges).engineKind).toBe('music-player')
    const sketch = buildShowPlayer(nodes, edges, {}, {
      patternSet: [], bakedAudio: false, preferredTrack: '', genericPlayer: true,
    })
    expect(sketch).not.toContain('(uint16_t)patternId);')
  })
})
