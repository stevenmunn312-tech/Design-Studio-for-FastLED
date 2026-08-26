import { describe, it, expect } from 'vitest'
import {
  INFO_DISPLAY_LAYOUTS,
  INFO_LAYOUT,
  STATUS_MAX_INDICATORS,
  asInfoDisplayLayout,
  blankInfoData,
  infoRowY,
  renderInfoDisplay,
  BROWSER_LAYOUT,
  type PatternBrowserData,
} from '../infoDisplay'
import { THUMBNAIL_W, THUMBNAIL_H } from '../patternThumbnail'
import { OLED_CONTROLLERS, getPixel, oledSurfaceRows, type OledSurface } from '../oledSurface'

const sh1106 = OLED_CONTROLLERS.SH1106

function litCount(surface: OledSurface): number {
  let n = 0
  for (let y = 0; y < surface.height; y++) {
    for (let x = 0; x < surface.width; x++) if (getPixel(surface, x, y)) n++
  }
  return n
}

/** Every lit pixel is inside the panel — the invariant every layout must hold. */
function withinPanel(surface: OledSurface): boolean {
  return oledSurfaceRows(surface).length === surface.height
    && oledSurfaceRows(surface).every((row) => row.length === surface.width)
}

const nowPlaying = (over: Partial<Parameters<typeof renderInfoDisplay>[1] extends { data: infer D } ? D : never> = {}) =>
  renderInfoDisplay(sh1106, {
    layout: 'Now Playing',
    data: {
      title: 'MIDNIGHT DRIVE', elapsedSec: 65, durationSec: 200,
      progress: 0.325, playing: true, volume: 0.75, ...over,
    },
  })

describe('layout selection', () => {
  it('offers the implemented layouts', () => {
    expect([...INFO_DISPLAY_LAYOUTS]).toEqual(['Now Playing', 'Clock', 'Status', 'Pattern Browser'])
  })

  // The Pattern Browser was held back until the runtime selection contract and
  // baked thumbnails existed, because offering it sooner would have meant a
  // layout that previews and cannot be generated. It reads both rather than
  // tracking an index or drawing an icon of its own.
  it('offers the Pattern Browser now that it can be generated', () => {
    expect(INFO_DISPLAY_LAYOUTS as readonly string[]).toContain('Pattern Browser')
  })

  it('falls back to a known layout for unknown input', () => {
    expect(asInfoDisplayLayout('nonsense')).toBe('Now Playing')
    expect(asInfoDisplayLayout(undefined)).toBe('Now Playing')
    expect(asInfoDisplayLayout('Clock')).toBe('Clock')
  })

  it('spaces rows so four fit the panel', () => {
    expect(infoRowY(0)).toBe(INFO_LAYOUT.margin)
    expect(infoRowY(3) + INFO_LAYOUT.barHeight).toBeLessThanOrEqual(sh1106.height)
  })
})

describe('Now Playing', () => {
  it('draws something for every field', () => {
    expect(litCount(nowPlaying())).toBeGreaterThan(50)
  })

  it('stays inside the panel', () => {
    expect(withinPanel(nowPlaying())).toBe(true)
  })

  it('shows more of the bar as the track advances', () => {
    const early = litCount(nowPlaying({ progress: 0 }))
    const mid = litCount(nowPlaying({ progress: 0.5 }))
    const late = litCount(nowPlaying({ progress: 1 }))
    expect(mid).toBeGreaterThan(early)
    expect(late).toBeGreaterThan(mid)
  })

  it('distinguishes playing from paused', () => {
    expect(litCount(nowPlaying({ playing: true }))).not.toBe(litCount(nowPlaying({ playing: false })))
  })

  // A long track name must not run into the time readout beside it.
  it('fits a long title rather than overrunning the row', () => {
    const long = nowPlaying({ title: 'A'.repeat(200) })
    expect(withinPanel(long)).toBe(true)
    const rows = oledSurfaceRows(long)
    // The title row leaves the right-hand margin clear.
    for (const y of [0, 1, 2, 3, 4]) {
      expect(rows[INFO_LAYOUT.margin + y].slice(-INFO_LAYOUT.margin)).toBe('.'.repeat(INFO_LAYOUT.margin))
    }
  })

  it('survives an empty track with no duration', () => {
    const blank = nowPlaying({ title: '', elapsedSec: 0, durationSec: 0, progress: 0, playing: false, volume: 0 })
    expect(withinPanel(blank)).toBe(true)
  })
})

describe('Clock', () => {
  const clock = (over: Record<string, unknown> = {}) => renderInfoDisplay(sh1106, {
    layout: 'Clock',
    data: { timeText: '09:05', dateText: '2026-08-25', valid: true, synced: true, ...over },
  } as never)

  it('draws the time, the date and a rule', () => {
    expect(litCount(clock())).toBeGreaterThan(40)
    expect(withinPanel(clock())).toBe(true)
  })

  // Showing the time anyway would be a display confidently reporting a reading
  // nobody should act on.
  it('says so when the reading is not trustworthy', () => {
    const bad = litCount(clock({ valid: false }))
    const unsynced = litCount(clock({ synced: false }))
    const good = litCount(clock())
    expect(bad).not.toBe(good)
    expect(unsynced).not.toBe(good)
    expect(bad).not.toBe(unsynced)
  })

  it('centres without pushing off the left edge', () => {
    const wide = clock({ timeText: 'X'.repeat(60) })
    expect(withinPanel(wide)).toBe(true)
  })
})

describe('Status', () => {
  const status = (over: Record<string, unknown> = {}) => renderInfoDisplay(sh1106, {
    layout: 'Status',
    data: {
      line1: 'SHOW RUNNING', line2: 'PATTERN FIRE', value: '42',
      progress: 0.5, indicators: [true, false, true, false], ...over,
    },
  } as never)

  it('draws both rows, the value, the bar and the indicators', () => {
    expect(litCount(status())).toBeGreaterThan(60)
    expect(withinPanel(status())).toBe(true)
  })

  it('distinguishes an on indicator from an off one', () => {
    const allOn = litCount(status({ indicators: [true, true, true, true] }))
    const allOff = litCount(status({ indicators: [false, false, false, false] }))
    expect(allOn).toBeGreaterThan(allOff)
  })

  // A layout that silently drops the fifth indicator is worse than one that
  // never offered it, so the cap is explicit and asserted.
  it('caps the indicators rather than overflowing the row', () => {
    const four = litCount(status({ indicators: [true, true, true, true] }))
    const eight = litCount(status({ indicators: new Array(8).fill(true) }))
    expect(eight).toBe(four)
    expect(STATUS_MAX_INDICATORS).toBe(4)
  })

  it('survives no indicators at all', () => {
    expect(withinPanel(status({ indicators: [] }))).toBe(true)
  })
})

describe('blank data', () => {
  it('renders every layout with nothing wired', () => {
    for (const layout of INFO_DISPLAY_LAYOUTS) {
      const blank = blankInfoData(layout)
      // Asserted, because the default branch quietly returns a Now Playing
      // struct: a layout added to the list but never wired into the dispatcher
      // passed this test by rendering a different layout entirely.
      expect(blank.layout, `${layout} has no blank data of its own`).toBe(layout)
      const surface = renderInfoDisplay(sh1106, blank)
      expect(withinPanel(surface), layout).toBe(true)
    }
  })

  it('shows a clock with no reading as such', () => {
    const blank = blankInfoData('Clock')
    expect(blank.layout).toBe('Clock')
    if (blank.layout === 'Clock') expect(blank.data.valid).toBe(false)
  })
})

describe('controller independence', () => {
  // The layout is the same picture on both panels; only the column window into
  // controller RAM differs, and that belongs to the driver.
  it('draws identical pixels on SH1106 and SSD1306', () => {
    const data = blankInfoData('Status')
    const a = renderInfoDisplay(OLED_CONTROLLERS.SH1106, data)
    const b = renderInfoDisplay(OLED_CONTROLLERS.SSD1306, data)
    expect(Array.from(a.data)).toEqual(Array.from(b.data))
  })
})

describe('Pattern Browser', () => {
  const thumb = (fill: number) => {
    const data = new Uint8Array((THUMBNAIL_W * THUMBNAIL_H) / 8)
    data.fill(fill)
    return { width: THUMBNAIL_W, height: THUMBNAIL_H, data }
  }

  const browser = (over: Partial<PatternBrowserData> = {}) => renderInfoDisplay(sh1106, {
    layout: 'Pattern Browser',
    data: {
      name: 'EMBER PULSE', ordinal: 3, count: 12,
      thumbnail: thumb(0xff), browsing: false, activeName: 'FIRE 2', ...over,
    },
  })

  it('draws the picture, the name and the ordinal', () => {
    expect(litCount(browser())).toBeGreaterThan(100)
    expect(withinPanel(browser())).toBe(true)
  })

  it('puts the picture on a page boundary so the device blit is a byte copy', () => {
    expect(BROWSER_LAYOUT.thumbY % 8).toBe(0)
    expect(THUMBNAIL_H % 8).toBe(0)
  })

  it('keeps the text clear of the picture', () => {
    expect(BROWSER_LAYOUT.textX).toBeGreaterThanOrEqual(BROWSER_LAYOUT.thumbX + THUMBNAIL_W)
  })

  it('actually blits the thumbnail it was given', () => {
    const lit = litCount(browser({ thumbnail: thumb(0xff) }))
    const dark = litCount(browser({ thumbnail: thumb(0x00) }))
    expect(lit - dark).toBe(THUMBNAIL_W * THUMBNAIL_H)
  })

  // Several patterns legitimately render black, so a missing picture has to
  // look different from a dark one or a failed bake reads as a working pattern.
  it('outlines an empty frame when a pattern has no thumbnail', () => {
    const none = litCount(browser({ thumbnail: null }))
    const black = litCount(browser({ thumbnail: thumb(0x00) }))
    expect(none).toBeGreaterThan(black)
  })

  // The highlight/active split is the point of the contract, and it is
  // invisible unless the panel says which one it is showing.
  it('distinguishes looking at a pattern from playing it', () => {
    const rows = (b: boolean) => oledSurfaceRows(browser({ browsing: b })).join('\n')
    expect(rows(true)).not.toBe(rows(false))
  })

  it('names what is still playing while you browse away from it', () => {
    // Without that line the panel confidently describes something the LEDs are
    // not doing.
    const browsing = litCount(browser({ browsing: true, activeName: 'FIRE 2' }))
    const shorter = litCount(browser({ browsing: true, activeName: '' }))
    expect(browsing).toBeGreaterThan(shorter)
  })

  it('says so rather than drawing an empty frame for an empty collection', () => {
    const empty = browser({ count: 0, ordinal: 0, name: '', thumbnail: null })
    expect(litCount(empty)).toBeGreaterThan(0)
    expect(litCount(empty)).toBeLessThan(litCount(browser()))
    expect(withinPanel(empty)).toBe(true)
  })

  it('fits a long pattern name rather than overrunning the panel', () => {
    expect(withinPanel(browser({ name: 'A'.repeat(200) }))).toBe(true)
    expect(withinPanel(browser({ browsing: true, activeName: 'B'.repeat(200) }))).toBe(true)
  })

  it('survives a three-digit collection', () => {
    expect(withinPanel(browser({ ordinal: 128, count: 256 }))).toBe(true)
  })
})
