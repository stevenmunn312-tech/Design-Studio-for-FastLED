import { describe, it, expect } from 'vitest'
import { generateCpp } from '../cppGenerator'
import type { StudioNode, StudioEdge } from '../../state/graphStore'
import { infoDisplayHelpersCpp } from '../infoDisplayCpp'
import { cppStringLiteral } from '../../state/displayText'
import { INFO_LAYOUT, infoRowY } from '../../state/infoDisplay'
import { OLED_CONTROLLERS } from '../../state/oledSurface'
import { FONT_W, FONT_H, DEFAULT_FONT } from '../../state/font'

function node(id: string, nodeType: string, category: string, props: Record<string, unknown> = {}): StudioNode {
  return {
    id,
    type: 'studioNode',
    position: { x: 0, y: 0 },
    data: { label: nodeType, nodeType, category, properties: props, inputs: [], outputs: [] },
  } as unknown as StudioNode
}

function edge(id: string, source: string, target: string, sh: string, th: string): StudioEdge {
  return { id, source, target, sourceHandle: sh, targetHandle: th } as unknown as StudioEdge
}

const outputNode = node('out', 'MatrixOutput', 'output', {
  width: 8, height: 8, chipset: 'WS2812B', colorOrder: 'GRB', dataPin: 5,
})

const oled = (props: Record<string, unknown> = {}) => node('oled', 'InfoDisplay', 'output', {
  partId: 'sh1106-oled-128x64', csPin: 5, dcPin: 16, resetPin: 17, sckPin: 18, mosiPin: 23, ...props,
})

describe('OLED helpers', () => {
  const helpers = infoDisplayHelpersCpp()

  it('carries the shared font metrics', () => {
    expect(helpers).toContain(`#define OLED_FONT_W   ${FONT_W}`)
    expect(helpers).toContain(`#define OLED_FONT_H   ${FONT_H}`)
  })

  // A glyph table typed out again is a glyph that differs from the preview.
  it('generates its glyph table rather than restating it', () => {
    expect(helpers).toContain('static const uint8_t _oledFont[')
    // Derived from the font, not restated: every glyph it defines must reach
    // the emitted charset, so adding one cannot silently miss the firmware.
    const expected = cppStringLiteral(
      Object.keys(DEFAULT_FONT.glyphs).filter((ch) => ch.length === 1).sort().join(''),
    )
    expect(helpers).toContain(`static const char _oledChars[] = ${expected};`)
  })

  // The font contains a double quote and a question mark. Emitted raw, the
  // first ends the C++ string early and the second forms a trigraph.
  it('escapes the charset it emits', () => {
    expect(helpers).toContain('\\"')
    expect(helpers).not.toMatch(/_oledChars\[\] = "[^\n]*[^\\]"[^;\n]/)
  })

  // The offset is the whole reason the flush is page-by-page rather than a
  // straight buffer dump.
  it('writes the column offset into every page address', () => {
    expect(helpers).toContain('_oledCommand(p, (uint8_t)(0x00 | (p.columnOffset & 0x0F)));')
    expect(helpers).toContain('_oledCommand(p, (uint8_t)(0x10 | ((p.columnOffset >> 4) & 0x0F)));')
  })

  it('pushes only on a change or a refresh deadline', () => {
    expect(helpers).toContain('if (!changed && (now - p.lastWriteMs) < OLED_REFRESH_MS) return;')
  })

  it('needs no external driver library', () => {
    expect(helpers).not.toContain('#include')
  })

  it('falls back for a character the font has no glyph for', () => {
    expect(helpers).toContain("if (glyph < 0) glyph = _oledGlyphIndex('?');")
  })
})

describe('generateCpp with an OLED', () => {
  it('configures the panel in setup and services it in the loop', () => {
    const src = generateCpp([outputNode, oled()], [])
    expect(src).toContain('_oledBeginSpi(_oled_oled, 5, 16, 17, 18, 23, 2, 0xa0, 0xc0);')
    expect(src).toContain('_oledFlush(_oled_oled,')
    expect(src).toContain('static OledPanel _oled_oled;')
  })

  // The SH1106's 132-column RAM sits behind a 128-column panel; the SSD1306's
  // do not. Emitting one offset for both shifts one of them two pixels.
  it('emits the offset the chosen module actually needs', () => {
    const sh = generateCpp([outputNode, oled({ partId: 'sh1106-oled-128x64' })], [])
    const ssd = generateCpp([outputNode, oled({ partId: 'ssd1306-oled-128x64' })], [])
    expect(sh).toContain(`, ${OLED_CONTROLLERS.SH1106.columnOffset}, 0xa0, 0xc0);`)
    expect(ssd).toContain(`, ${OLED_CONTROLLERS.SSD1306.columnOffset}, 0xa0, 0xc0);`)
    expect(OLED_CONTROLLERS.SH1106.columnOffset).not.toBe(OLED_CONTROLLERS.SSD1306.columnOffset)
  })

  // The change that keeps a display in the sketch at all.
  it('survives the prune despite feeding no LED output', () => {
    expect(generateCpp([outputNode, oled()], [])).toContain('_oled_oled')
  })

  it('keeps what feeds a display alive too', () => {
    const nodes = [outputNode, node('t', 'TextValue', 'math', { text: 'HELLO' }), oled({ infoLayout: 'Status' })]
    const src = generateCpp(nodes, [edge('e', 't', 'oled', 'text', 'title')])
    expect(src).toContain('n_t_text')
    expect(src).toContain('_oledFit(_oledBuf_oled, sizeof(_oledBuf_oled), n_t_text,')
  })

  it('leaves the driver out of a sketch with no OLED', () => {
    const src = generateCpp([outputNode], [])
    expect(src).not.toContain('OledPanel')
    expect(src).not.toContain('_oledBegin')
  })

  it('emits the driver once for two panels', () => {
    // An SPI SH1106 and an I2C SSD1306 in one build: one driver, two panels,
    // and each begun through the transport its module actually has.
    const second = node('oled2', 'InfoDisplay', 'output', {
      partId: 'ssd1306-oled-128x64', sdaPin: 21, sclPin: 22,
    })
    const src = generateCpp([outputNode, oled(), second], [])
    expect(src.split('struct OledPanel {').length - 1).toBe(1)
    expect(src.split('static void _oledInit').length - 1).toBe(1)
    expect(src).toContain('_oled_oled')
    expect(src).toContain('_oled_oled2')
  })

  it('renders each layout through its own geometry', () => {
    expect(generateCpp([outputNode, oled({ infoLayout: 'Now Playing' })], [])).toContain('"PLAY" : "PAUSE"')
    expect(generateCpp([outputNode, oled({ infoLayout: 'Clock' })], [])).toContain('"NO CLOCK"')
    expect(generateCpp([outputNode, oled({ infoLayout: 'Status' })], [])).toContain('_oledIndicator(')
  })

  // Geometry comes from the shared layout module, so a margin cannot be typed
  // twice and disagree.
  it('emits the shared layout geometry rather than its own', () => {
    const src = generateCpp([outputNode, oled({ infoLayout: 'Now Playing' })], [])
    expect(src).toContain(`_oledText(_oled_oled, ${INFO_LAYOUT.margin}, ${infoRowY(0)},`)
    expect(src).toContain(`${128 - (INFO_LAYOUT.margin * 2)}, ${INFO_LAYOUT.barHeight},`)
  })

  // No trustworthy reading says so, rather than showing a plausible time.
  it('dashes a clock with no reading', () => {
    const src = generateCpp([outputNode, oled({ infoLayout: 'Clock' })], [])
    expect(src).toContain('"--:--"')
  })

  it('reads a wired clock struct', () => {
    const nodes = [outputNode, node('rtc', 'RTCInput', 'input', { timeSource: 'DS3231' }), oled({ infoLayout: 'Clock' })]
    const src = generateCpp(nodes, [edge('e', 'rtc', 'oled', 'dateTime', 'dateTime')])
    expect(src).toContain('n_rtc_dateTime.valid')
    expect(src).toContain('n_rtc_dateTime.hour')
  })

  // The fix for a panel bolted in upside down: the commands change, the
  // drawing does not.
  it('emits the reversed scan pair for a panel mounted at 180', () => {
    const src = generateCpp([outputNode, oled({ oledRotation: '180' })], [])
    expect(src).toContain('0xa1, 0xc8);')
    expect(src).not.toContain('0xa0, 0xc0);')
  })

  it('honours a disabled panel', () => {
    const src = generateCpp([outputNode, oled({ enabled: false })], [])
    expect(src).toContain('bool _oledOn_oled = false;')
  })

  it('clamps progress rather than letting a bar overflow its box', () => {
    const src = generateCpp([outputNode, oled({ infoLayout: 'Status' })], [])
    expect(src).toMatch(/_oledBar\(_oled_oled, \d+, \d+, \d+, \d+, constrain\(/)
  })
})

/*
 * The 4-pin module.
 *
 * Its part option shipped before its driver did, so choosing it produced a
 * sketch that bit-banged SPI at a module with no CS, DC or reset pin: a
 * successful build and a dark panel, which is the one outcome the display
 * plan says a generator must never produce.
 */
describe('generateCpp with an I2C OLED', () => {
  const i2c = (props: Record<string, unknown> = {}) => node('oled', 'InfoDisplay', 'output', {
    partId: 'ssd1306-oled-128x64', sdaPin: 21, sclPin: 22, ...props,
  })

  it('begins the panel on the bus rather than on four wires', () => {
    const src = generateCpp([outputNode, i2c()], [])
    expect(src).toContain('_oledBeginI2c(_oled_oled, 0x3c, 0, 0xa0, 0xc0);')
    expect(src).not.toContain('_oledBeginSpi(_oled_oled')
  })

  it('brings in Wire and starts it before the panel is addressed', () => {
    const src = generateCpp([outputNode, i2c()], [])
    expect(src).toContain('#include <Wire.h>')
    // The call, not the driver's definition of it, which sits far above.
    expect(src.indexOf('Wire.begin();')).toBeLessThan(src.indexOf('_oledBeginI2c(_oled_oled'))
  })

  // The explicit-pin form needs a board that can route Wire anywhere, which is
  // why this one names a profile and the tests above take the generic default.
  it('starts the bus on the pins the panel was wired to', () => {
    const board = node('board', 'Board', 'input', { profileId: 'seeed-xiao-esp32s3' })
    expect(generateCpp([board, outputNode, i2c({ sdaPin: 8, sclPin: 9 })], []))
      .toContain('Wire.begin(8, 9);')
  })

  it('honours the strap the module was set to', () => {
    expect(generateCpp([outputNode, i2c({ i2cAddress: '0x3D' })], []))
      .toContain('_oledBeginI2c(_oled_oled, 0x3d,')
  })

  // The DS3231 and the panel are one bus with two addresses, so one begin.
  it('starts one bus for a panel and a clock together', () => {
    const rtc = node('rtc', 'RTCInput', 'input', { timeSource: 'DS3231', sdaPin: 21, sclPin: 22 })
    const src = generateCpp([outputNode, i2c(), rtc], [])
    // `Wire.beginTransmission` is not a second bus start, so match the call.
    expect(src.split(/Wire\.begin\(\d*(?:, \d+)?\);/).length - 1).toBe(1)
    expect(src.split('#include <Wire.h>').length - 1).toBe(1)
  })

  // The layout is the surface's, not the bus's: the same picture reaches both
  // modules, and only the byte-shipping differs.
  it('draws the same layout as the SPI panel', () => {
    const spi = generateCpp([outputNode, oled({ infoLayout: 'Status' })], [])
    const bus = generateCpp([outputNode, i2c({ infoLayout: 'Status' })], [])
    const body = (src: string) => src.slice(src.indexOf('{ // Info Display'), src.indexOf('_oledFlush('))
    expect(body(bus)).toBe(body(spi))
  })

  // A build with only an SPI panel has no bus to start — but it still has to
  // declare one, and this test used to assert the opposite.
  //
  // That is how the panel on the bench shipped a sketch that would not compile.
  // The shared driver branches on transport at runtime, so its Wire calls are
  // compiled whichever module is fitted; omitting the header left `Wire` an
  // undeclared name and the build failed on a line no generator wrote. The
  // header follows the driver, and starting the bus follows the device.
  it('declares Wire but does not start it with nothing on the bus', () => {
    const src = generateCpp([outputNode, oled()], [])
    expect(src).toContain('#include <Wire.h>')
    // The call, not the driver comment that mentions it.
    expect(src).not.toMatch(/^\s*Wire\.begin\(/m)
  })
})
