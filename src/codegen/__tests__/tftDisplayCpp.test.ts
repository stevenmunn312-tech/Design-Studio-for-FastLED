import { describe, it, expect } from 'vitest'
import {
  TFT_DISPLAY_CPP_FORWARD,
  TFT_DISPLAY_CPP_INCLUDES,
  TFT_PANEL_RAM_BYTES,
  tftDisplayHelpersCpp,
  tftDisplayGlobalCpp,
  tftDisplayLoopCpp,
  tftDisplaySetupCpp,
  type TftDisplayEmit,
} from '../tftDisplayCpp'
import { cppStringLiteral } from '../../state/displayText'
import { DEFAULT_FONT, FONT_H, FONT_W } from '../../state/font'
import {
  TFT_CONTROLLERS, TFT_ROTATIONS, tftMadctl, tftRotatedSize, tftWindowOrigin,
  type TftRotation,
} from '../../state/tftSurface'
import {
  TRANSPORT_ARTWORK_H, TRANSPORT_ARTWORK_W, TRANSPORT_COLORS,
  fixedTransportGeometry, nowPlayingGeometry, showStatusGeometry,
} from '../../state/transportDisplay'

const st7789 = TFT_CONTROLLERS.ST7789
const st7789v = TFT_CONTROLLERS.ST7789V

const emit = (over: Partial<TftDisplayEmit> = {}): TftDisplayEmit => ({
  id: 'tft1',
  controller: st7789,
  rotation: '0',
  layout: 'Now Playing',
  csPin: 5, dcPin: 16, resetPin: 17, sckPin: 18, mosiPin: 23, backlightPin: 4,
  enabledExpr: 'true',
  titleExpr: '_title', artistExpr: '_artist', patternNameExpr: '_pattern',
  elapsedExpr: '_elapsed', durationExpr: '_duration', progressExpr: '_progress',
  playingExpr: '_playing', volumeExpr: '_volume',
  patternIndexExpr: '_index', patternCountExpr: '_count', sectionExpr: '_section',
  bpmExpr: '_bpm', beatExpr: '_beat', outputEnabledExpr: '_out', brightnessExpr: '_bright',
  ...over,
})

const helpers = tftDisplayHelpersCpp()

describe('the sketch preamble', () => {
  // The Arduino .ino preprocessor hoists a prototype for every function above
  // all user type definitions, so a helper taking TftPanel& fails to compile on
  // a line no generator wrote. The forward declaration is the fix; this only
  // pins that it names the struct the helpers actually define.
  it('forward-declares the struct the helpers define', () => {
    expect(TFT_DISPLAY_CPP_FORWARD).toBe('struct TftPanel;')
    expect(helpers).toContain('struct TftPanel {')
    expect(helpers).toMatch(/TftPanel\s*&/)
  })

  // Unlike the OLED, which bit-bangs and needs nothing, this panel is driven
  // through the Arduino SPI library. Stated rather than assumed.
  it('names the include the driver needs', () => {
    expect(TFT_DISPLAY_CPP_INCLUDES).toContain('#include <SPI.h>')
    expect(helpers).toContain('SPI.beginTransaction')
    expect(helpers).toContain('SPI.endTransaction')
  })
})

describe('the emitted driver', () => {
  it('carries the shared font metrics rather than its own', () => {
    expect(helpers).toContain(`#define TFT_FONT_W    ${FONT_W}`)
    expect(helpers).toContain(`#define TFT_FONT_H    ${FONT_H}`)
  })

  // A glyph table typed out again is a glyph that differs from the preview.
  it('generates its glyph table from the shared font', () => {
    const expected = cppStringLiteral(
      Object.keys(DEFAULT_FONT.glyphs).filter((ch) => ch.length === 1).sort().join(''),
    )
    expect(helpers).toContain(`static const char _tftChars[] = ${expected};`)
    expect(helpers).toContain('static const uint8_t _tftFont[')
  })

  // Generated C++ lives inside a TypeScript template literal, where a backtick
  // in a comment terminates the template. It has cost this repo a build twice.
  it('contains no backtick that would terminate its own template', () => {
    expect(helpers).not.toContain('`')
  })

  // Fixed buffers and snprintf in generated loop code, never an Arduino String
  // reallocating once per LED frame.
  it('uses fixed buffers rather than Arduino String', () => {
    expect(helpers).not.toMatch(/\bString\b/)
    expect(helpers).toContain('snprintf')
  })

  // Wall-clock, never a frame counter: an LED loop's rate depends on the strip
  // length, so pacing on frames would run the panel at a different speed on
  // every build.
  it('paces itself on the wall clock', () => {
    expect(helpers).toContain('#define TFT_MIN_INTERVAL_MS')
    expect(helpers).toContain('#define TFT_REFRESH_MS')
    expect(helpers).toMatch(/uint32_t now = millis\(\)/)
  })

  // No framebuffer: a 240x240 frame is 115 KB and does not fit beside FastLED
  // and audio. Fields cache what they last said instead.
  it('caches fields rather than frames', () => {
    expect(helpers).toContain('char text[TFT_TEXT_SLOTS][TFT_SLOT_CHARS + 1];')
    expect(helpers).toContain('int32_t value[TFT_VALUE_SLOTS];')
    expect(helpers).not.toMatch(/uint16_t\s+buf\[/)
  })

  // Casting a NaN or an infinity to an integer type is undefined behaviour,
  // and these values come off a graph edge: an unwired port, a count that has
  // not arrived, a division that went wrong upstream.
  it('never casts a wire float straight to an integer', () => {
    expect(helpers).toContain('static long _tftWhole(float value)')
    expect(helpers).toContain('static long _tftFloorWhole(float value)')
    const loops = [
      tftDisplayLoopCpp(emit()).join('\n'),
      tftDisplayLoopCpp(emit({ layout: 'Show Status' })).join('\n'),
    ].join('\n')
    expect(loops).not.toMatch(/\(long\)\s*(lroundf|floorf)/)
  })

  it('costs hundreds of bytes of RAM, not thousands', () => {
    expect(TFT_PANEL_RAM_BYTES).toBeGreaterThan(200)
    expect(TFT_PANEL_RAM_BYTES).toBeLessThan(1024)
  })

  // Both catalogued IPS panels are wired normally-black. Without INVON the
  // panel renders a photographic negative.
  it('can invert the panel', () => {
    expect(helpers).toContain('#define TFT_INVON')
    expect(helpers).toContain('invert ? TFT_INVON : TFT_INVOFF')
  })

  // Finished bytes, straight to the bus: the picture is baked in the browser,
  // so a scaler here would be a second implementation to disagree with it.
  it('blits artwork without scaling or converting it', () => {
    expect(helpers).toContain('pgm_read_byte')
    expect(helpers).not.toMatch(/_tftArt[\s\S]{0,400}(dither|scale|resize)/i)
  })

  it('brings every colour from the shared table', () => {
    expect(helpers).toContain(`#define TFT_C_BG      0x${(TRANSPORT_COLORS.background).toString(16).padStart(4, '0').toUpperCase()}`)
    expect(helpers).toContain(`#define TFT_C_ACCENT  0x${(TRANSPORT_COLORS.accent).toString(16).padStart(4, '0').toUpperCase()}`)
  })
})

describe('setup', () => {
  it('declares one panel per node', () => {
    expect(tftDisplayGlobalCpp(emit())).toBe('static TftPanel _tft_tft1;')
  })

  it('hands the driver the pins the node was given', () => {
    const line = tftDisplaySetupCpp(emit()).join('\n')
    expect(line).toContain('_tftBegin(_tft_tft1, 5, 16, 17, 18, 23, 4,')
  })

  // The offsets every ST7789 library carries as a hand-written table, derived
  // here instead. Without them the picture sits off the glass with a band of
  // noise down one edge, which reads as a wiring fault.
  it.each(TFT_ROTATIONS)('emits the derived window origin at %s degrees', (rotation) => {
    const line = tftDisplaySetupCpp(emit({ rotation: rotation as TftRotation })).join('\n')
    const size = tftRotatedSize(st7789, rotation as TftRotation)
    const origin = tftWindowOrigin(st7789, rotation as TftRotation)
    const madctl = tftMadctl(st7789, rotation as TftRotation)
    expect(line).toContain(`${size.width}, ${size.height}, ${origin.col}, ${origin.row}, `
      + `0x${madctl.toString(16).padStart(2, '0')}`)
  })

  it('gives the 240x240 panel its eighty-row offset when it is mounted upside down', () => {
    expect(tftDisplaySetupCpp(emit({ rotation: '180' })).join('\n')).toContain('240, 240, 0, 80,')
  })

  it('needs no offset for the panel whose glass fills its frame memory', () => {
    const line = tftDisplaySetupCpp(emit({ controller: st7789v, rotation: '180' })).join('\n')
    expect(line).toContain('240, 320, 0, 0,')
  })

  it('tells the driver there is no backlight to drive', () => {
    expect(tftDisplaySetupCpp(emit({ backlightPin: 255 })).join('\n')).toContain(', 255, 240, 240,')
    expect(helpers).toContain('if (p.bl == 255) return;')
  })
})

describe('the loop', () => {
  const nowPlaying = tftDisplayLoopCpp(emit()).join('\n')
  const fixedTransport = tftDisplayLoopCpp(emit({ layout: 'Fixed Transport' })).join('\n')
  const showStatus = tftDisplayLoopCpp(emit({ layout: 'Show Status' })).join('\n')

  // Every coordinate comes from the shared geometry, resolved for this panel's
  // mounted size, rather than being written out again. It is the only reason
  // the panel and its preview can be claimed to match.
  it('emits Now Playing coordinates from the shared geometry', () => {
    const g = nowPlayingGeometry(240, 240)
    expect(nowPlaying).toContain(`${g.title.x}, ${g.title.y}, ${g.title.w}, ${g.title.h}, ${g.title.scale}, 1,`)
    expect(nowPlaying).toContain(`_tftBar(_tft_tft1, ${g.progress.x}, ${g.progress.y}, ${g.progress.w}, ${g.progress.h},`)
  })

  it('emits Show Status coordinates from the shared geometry', () => {
    const g = showStatusGeometry(240, 240)
    expect(showStatus).toContain(`${g.bpm.x}, ${g.bpm.y}, ${g.bpm.w}, ${g.bpm.h}, ${g.bpm.scale}, 2,`)
    expect(showStatus).toContain(`${g.beats.x} + (i * ${g.beats.w === 0 ? 0 : g.beatSize + g.beatGap})`)
  })

  it('emits Fixed Transport buttons from the shared geometry', () => {
    const g = fixedTransportGeometry(240, 240)
    expect(fixedTransport).toContain(`_tftRect(_tft_tft1, ${g.previous.rect.x}, ${g.previous.rect.y}, ${g.previous.rect.w}, ${g.previous.rect.h},`)
    expect(fixedTransport).toContain(`_tftRect(_tft_tft1, ${g.playPause.rect.x}, ${g.playPause.rect.y}, ${g.playPause.rect.w}, ${g.playPause.rect.h},`)
    expect(fixedTransport).toContain('"PREV"')
    expect(fixedTransport).toContain('"NEXT"')
  })

  it('resolves the geometry for the size the panel is mounted at', () => {
    const rotated = tftDisplayLoopCpp(emit({ controller: st7789v, rotation: '90' })).join('\n')
    const g = nowPlayingGeometry(320, 240)
    expect(rotated).toContain(`${g.title.x}, ${g.title.y}, ${g.title.w}, ${g.title.h},`)
    expect(rotated).not.toContain(`${nowPlayingGeometry(240, 320).title.y}, ${g.title.w},`)
  })

  // Short-circuiting past the dirty check leaves the cache stale behind a full
  // repaint, and the next pass then reports a change that already happened.
  it('always evaluates change detection, even on a full repaint', () => {
    for (const src of [nowPlaying, fixedTransport, showStatus]) {
      expect(src).toMatch(/_tftTextDirty\([^)]*\) \|\| _tftFull_/)
      expect(src).not.toMatch(/_tftFull_\w+ \|\| _tft(Text|Value)Dirty/)
    }
  })

  // Two fields sharing a slot would each report the other dirty forever, and
  // the panel would repaint both every pass for the rest of the run.
  it.each([['Now Playing', nowPlaying], ['Fixed Transport', fixedTransport], ['Show Status', showStatus]])(
    'gives every %s field its own cache slot', (_layout, src) => {
      const used = (pattern: RegExp) => [...src.matchAll(pattern)].map((m) => m[1])
      for (const slots of [used(/_tftTextDirty\(_tft_tft1, (\d+),/g), used(/_tftValueDirty\(_tft_tft1, (\d+),/g)]) {
        expect(slots.length).toBeGreaterThan(0)
        expect(new Set(slots).size).toBe(slots.length)
      }
    },
  )

  // A bar's value moves every frame and the bar it draws does not, so the
  // driver compares the pixels it would fill rather than the float behind them.
  it('compares bars by the pixels they would fill', () => {
    expect(nowPlaying).toMatch(/_tftValueDirty\(_tft_tft1, \d+, _tftBarFill\(/)
    expect(showStatus).toMatch(/_tftValueDirty\(_tft_tft1, \d+, _tftBarFill\(/)
  })

  it('drops the backlight for a disabled panel and leaves it alone', () => {
    expect(nowPlaying).toContain('_tftBacklight(_tft_tft1, _tftOn_tft1);')
    expect(nowPlaying).toContain('if (_tftOn_tft1 && _tftPaint(_tft_tft1, _tftFull_tft1))')
  })

  // An empty frame rather than a black square, so a track with no baked art
  // reads as a missing picture instead of as art that renders black.
  it('frames the artwork slot when nothing was baked', () => {
    const g = nowPlayingGeometry(240, 240)
    expect(nowPlaying).toContain(`_tftRect(_tft_tft1, ${g.artwork.x}, ${g.artwork.y}, ${g.artwork.w}, ${g.artwork.h}, TFT_C_FRAME);`)
    expect(nowPlaying).not.toContain('_tftArt(')
  })

  it('blits a baked table when there is one, by its own stem', () => {
    const src = tftDisplayLoopCpp(emit({ artwork: { tableStem: 'coll7' } })).join('\n')
    expect(src).toContain(`_artData_coll7);`)
    expect(src).toContain(`${TRANSPORT_ARTWORK_W}, ${TRANSPORT_ARTWORK_H},`)
    expect(src).not.toContain('TFT_C_FRAME')
  })

  // Neither the picture nor a static label changes while the sketch runs, so
  // comparing them every pass would be work with a known answer.
  it('draws the unchanging parts only on a full repaint', () => {
    expect(nowPlaying).toMatch(/if \(_tftFull_tft1\) _tftField\(_tft_tft1, [^)]*"VOL"/)
    expect(showStatus).toMatch(/if \(_tftFull_tft1\) _tftField\(_tft_tft1, [^)]*"BPM"/)
  })

  // The same refusal showStatusOrdinalText() makes in the browser.
  it('refuses to invent an ordinal with no collection', () => {
    expect(showStatus).toContain('"NO PATTERNS"')
    expect(showStatus).toContain('if (_tftCount_tft1 <= 0)')
  })

  it('marks a tempo it has no reading for', () => {
    expect(showStatus).toContain('"---"')
    expect(showStatus).toMatch(/!isfinite\(_tftBpmV_tft1\) \|\| _tftBpmV_tft1 <= 0/)
  })

  it('uses fixed buffers rather than Arduino String', () => {
    for (const src of [nowPlaying, showStatus]) {
      expect(src).not.toMatch(/\bString\b/)
      expect(src).not.toContain('`')
    }
  })
})

// Derived rather than listed, the way emittedSymbols.test.ts does it: whatever
// the loop calls or names, the helpers have to define. Adding a field to a
// layout and forgetting its macro is a compile error on the bench otherwise.
describe('everything the loop reaches for', () => {
  const sources = [
    tftDisplayLoopCpp(emit()).join('\n'),
    tftDisplayLoopCpp(emit({ layout: 'Show Status' })).join('\n'),
    tftDisplaySetupCpp(emit()).join('\n'),
  ].join('\n')

  it('is a helper the driver defines', () => {
    const called = new Set([...sources.matchAll(/\b(_tft[A-Za-z0-9_]*)\s*\(/g)].map((m) => m[1]))
    expect(called.size).toBeGreaterThan(0)
    for (const name of called) {
      expect(helpers, `${name} is called but never defined`).toMatch(
        new RegExp(String.raw`\b${name}\s*\(`),
      )
    }
  })

  it('is a colour the driver defines', () => {
    const used = new Set([...sources.matchAll(/\b(TFT_C_[A-Z]+)\b/g)].map((m) => m[1]))
    expect(used.size).toBeGreaterThan(0)
    for (const macro of used) {
      expect(helpers, `${macro} is used but never defined`).toContain(`#define ${macro}`)
    }
  })

  it('is a cache slot the struct has room for', () => {
    const slots = [...sources.matchAll(/_tft(?:Text|Value)Dirty\(_tft_tft1, (\d+),/g)].map((m) => Number(m[1]))
    expect(slots.length).toBeGreaterThan(0)
    const textSlots = Number(/#define TFT_TEXT_SLOTS (\d+)/.exec(helpers)?.[1])
    const valueSlots = Number(/#define TFT_VALUE_SLOTS (\d+)/.exec(helpers)?.[1])
    expect(Math.max(...slots)).toBeLessThan(Math.max(textSlots, valueSlots))
  })
})
