import { describe, it, expect } from 'vitest'
import { generateCpp } from '../cppGenerator'
import { NODE_LIBRARY, libraryDefaults } from '../../state/nodeLibrary'
import type { StudioNode, StudioEdge } from '../../state/graphStore'
import { nowPlayingGeometry, showStatusGeometry } from '../../state/transportDisplay'
import { TFT_CONTROLLERS, tftMadctl, tftRotatedSize, tftWindowOrigin } from '../../state/tftSurface'
import { TFT_DISPLAY_CPP_FORWARD } from '../tftDisplayCpp'

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

const output = node('out', 'MatrixOutput', {
  width: 16, height: 16, dataPin: 4, chipset: 'WS2812B', colorOrder: 'GRB',
})

const build = (props: Record<string, unknown> = {}, extra: StudioNode[] = [], edges: StudioEdge[] = []) =>
  generateCpp([output, node('tft', 'TransportDisplay', { partId: PLAIN, ...props }), ...extra], edges)

describe('a sketch with a colour panel', () => {
  const src = build()

  // The OLED bit-bangs and needs no include; 115 KB a frame does not travel
  // that way, so this driver uses the Arduino SPI library and has to say so.
  it('includes SPI, which the OLED never needed', () => {
    expect(src).toContain('#include <SPI.h>')
  })

  it('forward-declares the panel struct and then defines it', () => {
    expect(src).toContain(TFT_DISPLAY_CPP_FORWARD)
    expect(src).toContain('struct TftPanel {')
    expect(src.indexOf(TFT_DISPLAY_CPP_FORWARD)).toBeLessThan(src.indexOf('struct TftPanel {'))
  })

  it('declares one panel, sets it up, and draws it', () => {
    expect(src).toContain('static TftPanel _tft_tft;')
    expect(src).toContain('_tftBegin(_tft_tft,')
    expect(src).toContain('{ // Transport Display')
  })

  // A sketch with no colour panel should carry none of the driver: the helpers
  // are two hundred lines and a font table.
  it('carries none of it when no panel is on the bench', () => {
    const bare = generateCpp([output], [])
    expect(bare).not.toContain(TFT_DISPLAY_CPP_FORWARD)
    expect(bare).not.toContain('struct TftPanel')
    expect(bare).not.toContain('_tftBegin')
  })
})

describe('what setup tells the driver', () => {
  it('passes the pins the node was configured with', () => {
    const src = build({ csPin: 15, dcPin: 2, resetPin: 4, sckPin: 14, mosiPin: 13, backlightPin: 27 })
    expect(src).toContain('_tftBegin(_tft_tft, 15, 2, 4, 14, 13, 27,')
  })

  // Rotation is how the module is bolted down. Getting the window origin wrong
  // puts the picture off the glass with a band of noise down one edge, which
  // reads as a wiring fault rather than a software one.
  it.each(['0', '90', '180', '270'])('emits the derived geometry at %s degrees', (rotation) => {
    const src = build({ partId: PLAIN, tftRotation: rotation })
    const controller = TFT_CONTROLLERS.ST7789
    const size = tftRotatedSize(controller, rotation as never)
    const origin = tftWindowOrigin(controller, rotation as never)
    const madctl = tftMadctl(controller, rotation as never)
    expect(src).toContain(`${size.width}, ${size.height}, ${origin.col}, ${origin.row}, `
      + `0x${madctl.toString(16).padStart(2, '0')}`)
  })

  // ST7789V starts with ST7789. Resolving it by shortest prefix hands the
  // 240x320 module the 240x240 descriptor and draws eighty rows short.
  it('gives each catalogued module its own size', () => {
    expect(build({ partId: TOUCH })).toContain('240, 320, 0, 0,')
    expect(build({ partId: PLAIN })).toContain('240, 240, 0, 0,')
  })

  it('resolves the layout against the size the panel is mounted at', () => {
    const src = build({ partId: TOUCH, tftRotation: '90' })
    const g = nowPlayingGeometry(320, 240)
    expect(src).toContain(`${g.title.x}, ${g.title.y}, ${g.title.w}, ${g.title.h},`)
  })
})

describe('what the loop draws', () => {
  // Every coordinate comes from the shared geometry rather than being written
  // out again, which is the only reason the panel can be claimed to match the
  // preview the editor showed.
  it('emits Now Playing coordinates from the shared geometry', () => {
    const src = build({ tftLayout: 'Now Playing' })
    const g = nowPlayingGeometry(240, 240)
    expect(src).toContain(`_tftBar(_tft_tft, ${g.progress.x}, ${g.progress.y}, ${g.progress.w}, ${g.progress.h},`)
    expect(src).toContain(`${g.title.x}, ${g.title.y}, ${g.title.w}, ${g.title.h}, ${g.title.scale},`)
  })

  it('emits Show Status coordinates from the shared geometry', () => {
    const src = build({ tftLayout: 'Show Status' })
    const g = showStatusGeometry(240, 240)
    expect(src).toContain(`${g.bpm.x}, ${g.bpm.y}, ${g.bpm.w}, ${g.bpm.h}, ${g.bpm.scale},`)
    expect(src).toContain(`_tftIndicator(_tft_tft, ${g.beats.x} + (i * ${g.beatSize + g.beatGap}),`)
  })

  it('reads a wired string port from the node that publishes it', () => {
    const src = build({}, [node('txt', 'TextValue', { text: 'MIDNIGHT DRIVE' })], [
      { id: 'e', source: 'txt', target: 'tft', sourceHandle: 'text', targetHandle: 'title' } as unknown as StudioEdge,
    ])
    expect(src).toMatch(/const char \*_tftTitle_tft = n_txt_text;/)
  })

  it('draws an empty string for a port nothing feeds', () => {
    expect(build()).toContain('const char *_tftArtist_tft = "";')
  })

  // Clamped where it is read rather than trusting the wire: a progress value
  // past its ends would otherwise paint outside the bar it belongs to.
  it('clamps the values that drive bars', () => {
    const src = build()
    expect(src).toMatch(/float _tftProg_tft = constrain\(.*, 0\.0f, 1\.0f\);/)
    expect(src).toMatch(/float _tftVol_tft = constrain\(.*, 0\.0f, 1\.0f\);/)
  })

  // Nothing bakes colour art yet, so referencing a table would name a symbol
  // no generator declares — which emittedSymbols.test.ts exists to catch.
  it('draws the empty artwork frame rather than naming a table nothing writes', () => {
    const src = build({ tftLayout: 'Now Playing' })
    expect(src).toContain('TFT_C_FRAME')
    expect(src).not.toContain('_artData_')
    // The blit helper is still defined — it is what the baker will call — but
    // nothing in the loop reaches for it.
    expect(src).not.toContain('_tftArt(_tft_tft,')
  })

  it('switches the panel from a wired enable rather than the property', () => {
    expect(build({ enabled: false })).toContain('bool _tftOn_tft = false;')
    expect(build({ enabled: true })).toContain('bool _tftOn_tft = true;')
  })
})

describe('two panels on one bench', () => {
  const src = generateCpp([
    output,
    node('a', 'TransportDisplay', { partId: PLAIN, tftLayout: 'Now Playing', csPin: 5 }),
    node('b', 'TransportDisplay', { partId: TOUCH, tftLayout: 'Show Status', csPin: 15 }),
  ], [])

  it('gives each its own panel and its own setup', () => {
    expect(src).toContain('static TftPanel _tft_a;')
    expect(src).toContain('static TftPanel _tft_b;')
    expect(src).toContain('_tftBegin(_tft_a, 5,')
    expect(src).toContain('_tftBegin(_tft_b, 15,')
  })

  // The helpers are a font table and two hundred lines of driver. Emitting
  // them twice is not a warning, it is a redefinition error.
  it('emits the shared driver exactly once', () => {
    expect(src.split('struct TftPanel {').length - 1).toBe(1)
    expect(src.split('static const char _tftChars[]').length - 1).toBe(1)
    expect(src.split('#include <SPI.h>').length - 1).toBe(1)
  })

  it('draws each at its own mounted size', () => {
    expect(src).toContain('240, 240, 0, 0,')
    expect(src).toContain('240, 320, 0, 0,')
  })
})

describe('beside the other displays', () => {
  // A sketch can carry all three. Each driver names its own symbols, so the
  // font table exists once per driver rather than colliding.
  const src = generateCpp([
    output,
    node('tft', 'TransportDisplay', { partId: PLAIN }),
    node('oled', 'InfoDisplay', { partId: 'sh1106-oled-128x64', infoLayout: 'Status' }),
    node('seg', 'SegmentDisplay', { partId: 'tm1637-4digit-display', clkPin: 18, dioPin: 19 }),
  ], [])

  it('builds all three into one sketch', () => {
    expect(src).toContain('struct TftPanel {')
    expect(src).toContain('struct OledPanel {')
    expect(src).toContain('struct SegDisplay {')
  })

  it('keeps the two font tables apart', () => {
    expect(src).toContain('static const char _tftChars[]')
    expect(src).toContain('static const char _oledChars[]')
  })
})
