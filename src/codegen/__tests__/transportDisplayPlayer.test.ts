import { describe, it, expect } from 'vitest'
import { playerDisplaysFromGraph } from '../playerDisplays'
import { generatePlayerSketch } from '../playerSketchGenerator'
import { NODE_LIBRARY, libraryDefaults } from '../../state/nodeLibrary'
import type { StudioNode, StudioEdge } from '../../state/graphStore'
import { TFT_DISPLAY_CPP_FORWARD } from '../tftDisplayCpp'
import { fixedTransportGeometry, nowPlayingGeometry } from '../../state/transportDisplay'

const PLAIN = 'st7789-tft-240x240'
const TOUCH = 'st7789v-xpt2046-touch-240x320'

function node(id: string, nodeType: string, props: Record<string, unknown> = {}): StudioNode {
  const def = NODE_LIBRARY.find((n) => n.type === nodeType)!
  return {
    id, type: 'studioNode', position: { x: 0, y: 0 },
    data: {
      label: nodeType, nodeType, category: def.category,
      properties: { ...libraryDefaults(nodeType), ...props },
      inputs: def.inputs, outputs: def.outputs,
    },
  } as unknown as StudioNode
}

const edge = (id: string, s: string, sh: string, t: string, th: string) =>
  ({ id, source: s, target: t, sourceHandle: sh, targetHandle: th } as unknown as StudioEdge)

const resolve = (nodes: StudioNode[], edges: StudioEdge[] = []) =>
  playerDisplaysFromGraph(nodes as never, edges as never)

const sketch = (nodes: StudioNode[], edges: StudioEdge[] = []) =>
  generatePlayerSketch({}, undefined, { displays: resolve(nodes, edges) })

describe('resolving a colour panel for a player sketch', () => {
  it('finds it and keeps its own controller and rotation', () => {
    const displays = resolve([node('tft', 'TransportDisplay', { partId: TOUCH, tftRotation: '90' })])
    expect(displays.tft).toHaveLength(1)
    expect(displays.tft[0].controller.id).toBe('ST7789V')
    expect(displays.tft[0].rotation).toBe('90')
  })

  // Resolved to an object here rather than left as a part id, because the
  // window origin, the MADCTL byte and the size the layout resolves against
  // all come from it. Re-resolving in the generator is how the two halves
  // would come to disagree.
  it('carries the resolved controller rather than a part id to look up again', () => {
    const display = resolve([node('tft', 'TransportDisplay', { partId: PLAIN })]).tft[0]
    expect(display.controller.width).toBe(240)
    expect(display.controller.height).toBe(240)
  })

  it('takes the pins the node was configured with', () => {
    const display = resolve([
      node('tft', 'TransportDisplay', { partId: PLAIN, csPin: 15, backlightPin: 27 }),
    ]).tft[0]
    expect(display.csPin).toBe(15)
    expect(display.backlightPin).toBe(27)
  })

  it('reads a port the player itself knows', () => {
    const displays = resolve(
      [node('m', 'PatternMaster'), node('tft', 'TransportDisplay', { partId: PLAIN })],
      [edge('e', 'm', 'title', 'tft', 'title')],
    )
    expect(displays.tft[0].sources.title).toBe('songTitle')
    expect(displays.unresolved).toEqual([])
  })

  // A player sketch runs a fixed template, so a panel fed from a Wave has no
  // value to read. Naming it is what stops the sketch building successfully
  // with a panel that never shows the thing it was wired to.
  it('reports a port wired to something the template cannot evaluate', () => {
    const displays = resolve(
      [node('w', 'Wave'), node('tft', 'TransportDisplay', { partId: PLAIN })],
      [edge('e', 'w', 'result', 'tft', 'bpm')],
    )
    expect(displays.tft[0].sources.bpm).toBeUndefined()
    expect(displays.unresolved).toContainEqual({ display: 'tft', port: 'bpm', source: 'Wave' })
  })

  it('finds nothing when the graph has no colour panel', () => {
    expect(resolve([node('m', 'PatternMaster')]).tft).toEqual([])
  })
})

describe('the emitted player sketch', () => {
  const src = sketch([node('tft', 'TransportDisplay', { partId: PLAIN })])

  it('carries the driver, the panel and its setup', () => {
    expect(src).toContain(TFT_DISPLAY_CPP_FORWARD)
    expect(src).toContain('struct TftPanel {')
    expect(src).toContain('static TftPanel _tft_tft;')
    expect(src).toContain('_tftBegin(_tft_tft,')
    expect(src).toContain('{ // Transport Display')
  })

  // playerSketchGenerator already includes SPI for the SD card, so this must
  // not add a second one.
  it('includes SPI exactly once', () => {
    expect(src.split('#include <SPI.h>').length - 1).toBe(1)
  })

  it('draws the same geometry the normal sketch does', () => {
    const g = nowPlayingGeometry(240, 240)
    expect(src).toContain(`_tftBar(_tft_tft, ${g.progress.x}, ${g.progress.y}, ${g.progress.w}, ${g.progress.h},`)
  })

  // The player knows its own transport without being wired to itself, so an
  // unwired Now Playing panel on a player still shows the track.
  it('falls back to the sketch own readings rather than to zero', () => {
    expect(src).toContain('songElapsedSec()')
    expect(src).toContain('songDurationSec()')
    expect(src).toContain('songProgress()')
    expect(src).toContain('songPlaying()')
  })

  it('shows a wired title from the player', () => {
    const wired = sketch(
      [node('m', 'PatternMaster'), node('tft', 'TransportDisplay', { partId: PLAIN })],
      [edge('e', 'm', 'title', 'tft', 'title')],
    )
    expect(wired).toContain('const char *_tftTitle_tft = songTitle;')
  })

  // A player sketch has no show model, so Show Status can only report what it
  // is told — and zero patterns is what makes the panel say so outright.
  it('says there is no collection on an unwired Show Status panel', () => {
    const status = sketch([node('tft', 'TransportDisplay', { partId: PLAIN, tftLayout: 'Show Status' })])
    expect(status).toContain('"NO PATTERNS"')
    expect(status).toContain('long _tftCount_tft = _tftWhole(0.0f);')
  })

  it('carries none of the driver for a player with no colour panel', () => {
    const bare = generatePlayerSketch({}, undefined, {})
    expect(bare).not.toContain('struct TftPanel')
    expect(bare).not.toContain('_tftBegin')
  })
})

describe('XPT2046 player controls', () => {
  const graph = [
    node('tft', 'TransportDisplay', {
      partId: TOUCH, tftRotation: '90', touchCsPin: 15, touchIrqPin: 2,
      touchSckPin: 18, touchMosiPin: 23, touchMisoPin: 19,
      touchXMin: 321, touchXMax: 3789, touchYMin: 245, touchYMax: 3821,
    }),
    node('pc', 'PlayerControls'),
    node('m', 'PatternMaster'),
  ]
  const wires = [
    edge('touch-controls', 'tft', 'controls', 'pc', 'controlsIn'),
    edge('player-controls', 'pc', 'controls', 'm', 'controls'),
  ]

  it('only enables touch when its controls bundle reaches the player', () => {
    expect(resolve(graph, wires).tft[0].touch).toMatchObject({
      csPin: 15, irqPin: 2, sckPin: 18, mosiPin: 23, misoPin: 19,
      xMin: 321, xMax: 3789, yMin: 245, yMax: 3821,
    })
    expect(resolve(graph, []).tft[0].touch).toBeNull()
    expect(resolve([node('plain', 'TransportDisplay', { partId: PLAIN })]).tft[0].touch).toBeNull()
  })

  it('emits the software-SPI sampler, calibrated rotation, and visible hit regions', () => {
    const src = sketch(graph, wires)
    const g = nowPlayingGeometry(320, 240)
    expect(src).toContain('static uint16_t _xptRead12(')
    expect(src).toContain('_xptPoint(15, 2, 18, 23, 19, 321, 3789, 245, 3821, 240, 320, 1,')
    expect(src).toContain(`_touchX_tft >= ${g.state.x} && _touchX_tft < ${g.state.x + g.state.w}`)
    expect(src).toContain('if (audio.pauseResume()) playerPaused = !playerPaused;')
    expect(src).toContain(`(_touchX_tft - ${g.volume.x}) / ${g.volume.w - 1}.0f`)
  })

  it('does not carry touch code for an unwired touch panel', () => {
    expect(sketch([node('tft', 'TransportDisplay', { partId: TOUCH })]))
      .not.toContain('static uint16_t _xptRead12(')
  })

  it('routes every visible Fixed Transport button through player actions', () => {
    const fixedGraph = graph.map((candidate) => candidate.id === 'tft'
      ? node('tft', 'TransportDisplay', { ...candidate.data.properties, tftLayout: 'Fixed Transport' })
      : candidate)
    const src = sketch(fixedGraph, wires)
    const g = fixedTransportGeometry(320, 240)
    expect(src).toContain(`_touchX_tft >= ${g.previous.rect.x} && _touchX_tft < ${g.previous.rect.x + g.previous.rect.w}`)
    expect(src).toContain('changePlayerTrack(-1);')
    expect(src).toContain('changePlayerTrack(1);')
    expect(src).toContain('if (audio.pauseResume()) playerPaused = !playerPaused;')
  })
})

describe('a player driving every display at once', () => {
  const src = sketch([
    node('m', 'PatternMaster'),
    node('tft', 'TransportDisplay', { partId: PLAIN }),
    node('oled', 'InfoDisplay', { partId: 'sh1106-oled-128x64', infoLayout: 'Now Playing' }),
    node('seg', 'SegmentDisplay', { partId: 'tm1637-4digit-display', clkPin: 18, dioPin: 19 }),
  ])

  // Whatever supporting definitions a new emit needs, both generators must
  // emit them. Teaching one and not the other is what broke a build before.
  it('builds all three drivers into one player sketch', () => {
    expect(src).toContain('struct TftPanel {')
    expect(src).toContain('struct OledPanel {')
    expect(src).toContain('struct SegDisplay {')
  })

  it('emits each driver exactly once', () => {
    expect(src.split('struct TftPanel {').length - 1).toBe(1)
    expect(src.split('static const char _tftChars[]').length - 1).toBe(1)
  })
})
