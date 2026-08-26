// The Pattern Browser's generated half.
//
// The bytes are baked in the browser and blitted verbatim, so what matters
// here is that the emitted code reads the *shared* constants — geometry from
// BROWSER_LAYOUT/infoRowY, timings from patternSelection — rather than
// restating them. A coordinate typed twice is a coordinate that disagrees.

import { describe, it, expect } from 'vitest'
import { patternThumbnailTableCpp, THUMBNAIL_DRAW_CPP } from '../patternThumbnailCpp'
import { PATTERN_SELECTION_CPP } from '../patternSelectionCpp'
import { infoDisplayLoopCpp, type InfoDisplayEmit } from '../infoDisplayCpp'
import { THUMBNAIL_W, THUMBNAIL_H, THUMBNAIL_BYTES, blankThumbnail } from '../../state/patternThumbnail'
import {
  PATTERN_BROWSE_TIMEOUT_MS, ENCODER_COUNTS_PER_STEP, ENCODER_RESEAT_COUNTS,
} from '../../state/patternSelection'
import { BROWSER_LAYOUT, infoRowY } from '../../state/infoDisplay'

const lit = (fill: number) => {
  const data = new Uint8Array(THUMBNAIL_BYTES)
  data.fill(fill)
  return { width: THUMBNAIL_W, height: THUMBNAIL_H, data }
}

const table = (n: number) => patternThumbnailTableCpp('br',
  Array.from({ length: n }, (_, i) => ({ name: `PATTERN ${i}`, thumbnail: lit(0xa5) })))

const emit = (over: Partial<InfoDisplayEmit> = {}): InfoDisplayEmit => ({
  id: 'br', transport: 'spi', csPin: 1, dcPin: 2, resetPin: 5, sckPin: 6, mosiPin: 7,
  address: 0x3c, columnOffset: 2, segmentRemap: 0xa0, comScan: 0xc0,
  layout: 'Pattern Browser', enabledExpr: 'true',
  titleExpr: null, line2Expr: null, valueExpr: '0.0f', progressExpr: '0.0f',
  playingExpr: 'false', volumeExpr: '0.0f', durationExpr: '0.0f',
  dateTimeExpr: null, indicatorExprs: [],
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

  // A name read straight from a PROGMEM pointer returns whatever sits at the
  // same RAM offset on a board where that is a separate address space.
  it('copies names out of flash rather than pointing at them', () => {
    const src = table(1)
    expect(src).toContain('strncpy_P')
    expect(src).toContain('pgm_read_ptr')
    expect(src).toContain('pgm_read_byte')
  })

  it('names each table after its collection, so two browsers cannot collide', () => {
    const other = patternThumbnailTableCpp('two', [{ name: 'X', thumbnail: blankThumbnail() }])
    expect(other).toContain('THUMB_COUNT_two')
    expect(other).not.toContain('THUMB_COUNT_br')
  })

  it('emits a usable empty table for a collection with nothing in it', () => {
    const src = table(0)
    expect(src).toContain('#define THUMB_COUNT_br  0')
    expect(src).not.toContain('_thumbData_br[')
  })

  it('escapes a name rather than ending the string literal', () => {
    const src = patternThumbnailTableCpp('br', [{ name: 'A "QUOTED" ONE', thumbnail: blankThumbnail() }])
    expect(src).toContain('\\"')
  })
})

describe('the emitted selection contract', () => {
  // Restating a timeout or a detent size is how the panel and the preview come
  // to disagree about what a click does.
  it('reads its constants from the shared model', () => {
    expect(PATTERN_SELECTION_CPP).toContain(`#define SEL_BROWSE_MS       ${PATTERN_BROWSE_TIMEOUT_MS}`)
    expect(PATTERN_SELECTION_CPP).toContain(`#define SEL_COUNTS_PER_STEP ${ENCODER_COUNTS_PER_STEP}`)
    expect(PATTERN_SELECTION_CPP).toContain(`#define SEL_RESEAT_COUNTS   ${ENCODER_RESEAT_COUNTS}`)
  })

  it('wraps at both ends rather than stopping', () => {
    expect(PATTERN_SELECTION_CPP).toContain('next = ((next % n) + n) % n;')
  })

  it('never steps on the first encoder reading', () => {
    expect(PATTERN_SELECTION_CPP)
      .toContain('if (!s.encSeen) { s.encSeen = true; s.encLast = position; s.encCarry = 0; return 0; }')
  })

  it('treats a large jump as a re-seat rather than travel', () => {
    expect(PATTERN_SELECTION_CPP).toContain('if (delta > SEL_RESEAT_COUNTS || delta < -SEL_RESEAT_COUNTS)')
  })

  it('ends the browse on a confirm even when nothing changed', () => {
    const confirm = PATTERN_SELECTION_CPP.slice(PATTERN_SELECTION_CPP.indexOf('if (confirm) {'))
    expect(confirm.indexOf('s.active = s.highlight;')).toBeLessThan(confirm.indexOf('s.browseUntilMs = 0;'))
  })

  // browseUntilMs == 0 is the "not browsing" sentinel, so a deadline that
  // happened to land exactly there would silently cancel the browse.
  it('keeps the browse sentinel out of a real deadline', () => {
    expect(PATTERN_SELECTION_CPP).toContain('if (s.browseUntilMs == 0) s.browseUntilMs = 1;')
  })
})

describe('the emitted layout', () => {
  it('places the picture and text from the shared geometry', () => {
    const src = loop()
    expect(src).toContain(`_oledThumb(_oled_br, ${BROWSER_LAYOUT.thumbX}, ${BROWSER_LAYOUT.thumbY}, `)
    expect(src).toContain(`${BROWSER_LAYOUT.textX}, ${infoRowY(0)}`)
    expect(src).toContain(`${BROWSER_LAYOUT.textX}, ${infoRowY(1)}`)
  })

  // The panel draws the selection; the player advances it, from the controls
  // bundle. A display that also stepped it would be a second opinion about
  // what a click meant — which is the bug this refactor removed.
  it('reads the selection rather than advancing it', () => {
    const src = loop()
    expect(src).not.toContain('_selUpdate(')
    expect(src).not.toContain('_selEncoderSteps(')
    expect(src).toContain('_sel_br.highlight')
    expect(src).toContain('_oledThumb(')
  })

  it('names the player\'s selection, so two panels read one cursor', () => {
    const src = loop({ browser: { tableStem: 'shared', selVar: '_sel_shared' } })
    expect(src).toContain('_sel_shared.highlight')
    expect(src).toContain('THUMB_COUNT_shared')
  })

  it('says so rather than drawing an empty frame for an empty collection', () => {
    expect(loop()).toContain('if (THUMB_COUNT_br == 0)')
    expect(loop()).toContain('"NO PATTERNS"')
  })

  // The split is invisible unless the panel shows it, and a panel describing
  // what it is not playing is the failure the split exists to avoid.
  it('shows which pattern it is looking at, and what is still playing', () => {
    const src = loop()
    expect(src).toContain('_selBrowsing(_sel_br) ? "SELECT?" : "PLAYING"')
    expect(src).toContain('"PLAYING %s"')
    expect(src).toContain('_sel_br.active')
  })

  it('reads the name into a buffer rather than formatting from flash', () => {
    expect(loop()).toContain('_thumbName_br_read(_oledName_br, sizeof(_oledName_br)')
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
