// The Pattern Browser's generated half.
//
// The bytes are baked in the browser and blitted verbatim, so what matters
// here is that the emitted code reads the *shared* constants — geometry from
// the browser geometry, detents from patternSelection — rather than
// restating them. A coordinate typed twice is a coordinate that disagrees.

import { describe, it, expect } from 'vitest'
import { patternNameTableCpp, patternThumbnailTableCpp, THUMBNAIL_DRAW_CPP } from '../displays/patternThumbnailCpp'
import { PATTERN_SELECTION_CPP } from '../player/patternSelectionCpp'
import { infoDisplayLoopCpp, type InfoDisplayEmit } from '../displays/infoDisplayCpp'
import { THUMBNAIL_W, THUMBNAIL_H, THUMBNAIL_BYTES, blankThumbnail } from '../../state/patterns/patternThumbnail'
import { ENCODER_COUNTS_PER_STEP, ENCODER_RESEAT_COUNTS } from '../../state/patterns/patternSelection'
import { browserGeometry } from '../../state/displays/infoDisplay'

const lit = (fill: number) => {
  const data = new Uint8Array(THUMBNAIL_BYTES)
  data.fill(fill)
  return { width: THUMBNAIL_W, height: THUMBNAIL_H, data }
}

const table = (n: number) => patternThumbnailTableCpp('br',
  Array.from({ length: n }, () => lit(0xa5)))
const names = (n: number) => patternNameTableCpp('br',
  Array.from({ length: n }, (_, i) => `PATTERN ${i}`))

const emit = (over: Partial<InfoDisplayEmit> = {}): InfoDisplayEmit => ({
  id: 'br', controller: 'SH1106', transport: 'spi', csPin: 1, dcPin: 2, resetPin: 5, sckPin: 6, mosiPin: 7,
  address: 0x3c, width: 128, height: 64, columnOffset: 2, segmentRemap: 0xa0, comScan: 0xc0,
  layout: 'Pattern Browser', enabledExpr: 'true',
  titleExpr: null, line2Expr: null, valueExpr: '0.0f', progressExpr: '0.0f',
  playingExpr: 'false', volumeExpr: '0.0f', durationExpr: '0.0f',
  dateTimeExpr: null,
  browser: { tableStem: 'br', selVar: '_sel_br' },
  ...over,
})

const loop = (over: Partial<InfoDisplayEmit> = {}) => infoDisplayLoopCpp(emit(over)).join('\n')

describe('the thumbnail table', () => {
  it('emits the bytes it was handed, in flash', () => {
    const src = table(2)
    expect(src).toContain('PROGMEM')
    expect(src).toContain('#define THUMB_COUNT_br  2')
    expect(src).toContain(`#define THUMB_BYTES_br  ${THUMBNAIL_BYTES}`)
    expect((src.match(/0xa5/g) ?? []).length).toBe(THUMBNAIL_BYTES * 2)
  })

  it('takes its geometry from the shared model', () => {
    const src = table(1)
    expect(src).toContain(`#define THUMB_W_br      ${THUMBNAIL_W}`)
    expect(src).toContain(`#define THUMB_H_br      ${THUMBNAIL_H}`)
  })

  it('reads bytes out of flash rather than copying them into RAM', () => {
    expect(table(1)).toContain('pgm_read_byte')
  })

  it('names each table after its collection, so two browsers cannot collide', () => {
    const other = patternThumbnailTableCpp('two', [blankThumbnail()])
    expect(other).toContain('THUMB_COUNT_two')
    expect(other).not.toContain('THUMB_COUNT_br')
  })

  it('emits a usable empty table for a collection with nothing in it', () => {
    const src = table(0)
    expect(src).toContain('#define THUMB_COUNT_br  0')
    expect(src).not.toContain('_thumbData_br[')
  })

  // Pictures need a bake, a trust decision and a flash budget; names need
  // none of the three, so a panel that only names patterns gets a table of
  // its own rather than borrowing a browser's.
  it('carries no names, so a name needs no picture', () => {
    expect(table(2)).not.toContain('_patName_br_read')
    expect(table(2)).not.toContain('strncpy_P')
  })
})

describe('the pattern name table', () => {
  // A name read straight from a PROGMEM pointer returns whatever sits at the
  // same RAM offset on a board where that is a separate address space.
  it('copies names out of flash rather than pointing at them', () => {
    const src = names(2)
    expect(src).toContain('#define PATTERN_NAME_COUNT_br  2')
    expect(src).toContain('"PATTERN 0"')
    expect(src).toContain('strncpy_P')
    expect(src).toContain('pgm_read_ptr')
  })

  it('emits a reader that answers emptily for a collection with no names', () => {
    const src = names(0)
    expect(src).toContain('#define PATTERN_NAME_COUNT_br  0')
    expect(src).toContain('static void _patName_br_read(char *dst, size_t dstSize, uint16_t index)')
    expect(src).not.toContain('_patNames_br[')
  })

  it('names each table after its collection, so two panels cannot collide', () => {
    expect(patternNameTableCpp('two', ['X'])).not.toContain('_patName_br_')
  })

  // Folding every stray character to `_` gave `a-b` and `a_b` one stem, and
  // one stem is a duplicate #define and a duplicate symbol in the same sketch.
  it('keeps ids that differ only in a non-identifier character apart', () => {
    const dashed = patternNameTableCpp('a-b', ['X'])
    const underscored = patternNameTableCpp('a_b', ['X'])
    expect(dashed).toContain('PATTERN_NAME_COUNT_a_2db')
    expect(dashed).not.toContain('PATTERN_NAME_COUNT_a_b ')
    expect(underscored).toContain('PATTERN_NAME_COUNT_a_b ')
    expect(patternThumbnailTableCpp('a-b', [blankThumbnail()])).toContain('THUMB_COUNT_a_2db')
    // An id that is already an identifier is the stem the panels were handed.
    expect(patternNameTableCpp('show', ['X'])).toContain('_patName_show_read')
  })

  it('escapes a name rather than ending the string literal', () => {
    expect(patternNameTableCpp('br', ['A "QUOTED" ONE'])).toContain('\\"')
  })
})

describe('the emitted selection contract', () => {
  // Restating a detent size is how the panel and the preview come to disagree
  // about what a click does.
  it('reads its constants from the shared model', () => {
    expect(PATTERN_SELECTION_CPP).toContain(`#define SEL_COUNTS_PER_STEP ${ENCODER_COUNTS_PER_STEP}`)
    expect(PATTERN_SELECTION_CPP).toContain(`#define SEL_RESEAT_COUNTS   ${ENCODER_RESEAT_COUNTS}`)
  })

  it('wraps at both ends rather than stopping', () => {
    expect(PATTERN_SELECTION_CPP).toContain('s.active = (uint16_t)((((long)s.active + steps) % n + n) % n);')
  })

  // No confirm: a step moves the running pattern, so nothing browses.
  it('has one cursor and no browse state', () => {
    expect(PATTERN_SELECTION_CPP).toContain('static void _selUpdate(PatternSel &s, uint16_t count, int steps)')
    expect(PATTERN_SELECTION_CPP).not.toMatch(/highlight|browse/i)
  })

  it('never steps on the first encoder reading', () => {
    expect(PATTERN_SELECTION_CPP)
      .toContain('if (!s.encSeen) { s.encSeen = true; s.encLast = position; s.encCarry = 0; return 0; }')
  })

  it('treats a large jump as a re-seat rather than travel', () => {
    expect(PATTERN_SELECTION_CPP).toContain('if (delta > SEL_RESEAT_COUNTS || delta < -SEL_RESEAT_COUNTS)')
  })

})

describe('the emitted layout', () => {
  it('places the picture and text from the shared geometry', () => {
    const src = loop()
    const g = browserGeometry(128, 64)
    expect(src).toContain(`_oledThumb(_oled_br, ${g.thumb.x}, ${g.thumb.y}, `)
    expect(src).toContain(`${g.name.x}, ${g.name.y}`)
    expect(src).toContain(`${g.ordinal.x}, ${g.ordinal.y}`)
  })

  // The panel draws the selection; the player advances it, from the controls
  // bundle. A display that also stepped it would be a second opinion about
  // what a click meant — which is the bug this refactor removed.
  it('reads the selection rather than advancing it', () => {
    const src = loop()
    expect(src).not.toContain('_selUpdate(')
    expect(src).not.toContain('_selEncoderSteps(')
    expect(src).toContain('_sel_br.active')
    expect(src).toContain('_oledThumb(')
  })

  it('names the player\'s selection, so two panels read one cursor', () => {
    const src = loop({ browser: { tableStem: 'shared', selVar: '_sel_shared' } })
    expect(src).toContain('_sel_shared.active')
    expect(src).toContain('THUMB_COUNT_shared')
  })

  // "NO PATTERNS" means the collection is empty, not that nobody baked it.
  // Gating on the picture count made an unbaked or over-budget collection
  // report nothing to show while its names sat in flash beside it.
  it('says so for an empty collection, and draws a blank frame for an unbaked one', () => {
    expect(loop()).toContain('if (PATTERN_NAME_COUNT_br == 0)')
    expect(loop()).toContain('"NO PATTERNS"')
    expect(loop()).toContain('if (THUMB_COUNT_br == 0) _oledThumbMissing(')
    expect(loop()).toContain('else _oledThumb(')
    expect(loop()).toContain('(unsigned)PATTERN_NAME_COUNT_br')
  })

  // Previous and Next change the pattern on the LEDs, so the panel only ever
  // has the running pattern to describe.
  it('describes the running pattern', () => {
    const src = loop()
    expect(src).toContain('uint16_t _oledSel_br = _sel_br.active;')
    expect(src).toContain('"PLAYING"')
    expect(src).not.toMatch(/SELECT\?|_selBrowsing|highlight/)
  })

  it('reads the name into a buffer rather than formatting from flash', () => {
    expect(loop()).toContain('_patName_br_read(_oledName_br, sizeof(_oledName_br)')
  })
})

describe('the blit helper', () => {
  it('walks pages rather than transposing per pixel', () => {
    expect(THUMBNAIL_DRAW_CPP).toContain('uint16_t base = (sy / 8) * width;')
    expect(THUMBNAIL_DRAW_CPP).toContain('uint8_t bit = (uint8_t)(1 << (sy % 8));')
  })

  it('has an empty frame for a pattern whose thumbnail did not bake', () => {
    expect(THUMBNAIL_DRAW_CPP).toContain('_oledThumbMissing')
  })
})
