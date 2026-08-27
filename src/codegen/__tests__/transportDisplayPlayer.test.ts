import { describe, it, expect } from 'vitest'
import { playerDisplaysFromGraph } from '../playerDisplays'
import { generatePlayerSketch } from '../playerSketchGenerator'
import { NODE_LIBRARY, libraryDefaults } from '../../state/nodeLibrary'
import type { StudioNode, StudioEdge } from '../../state/graphStore'
import { TFT_DISPLAY_CPP_FORWARD } from '../tftDisplayCpp'
import { nowPlayingGeometry } from '../../state/transportDisplay'

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
