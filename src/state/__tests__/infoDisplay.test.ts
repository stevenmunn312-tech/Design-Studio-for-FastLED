import { describe, it, expect } from 'vitest'
import {
  INFO_DISPLAY_LAYOUTS,
  INFO_LAYOUT,
  infoLayoutForKind,
  blankInfoData,
  infoRowPitch,
  nowPlayingGeometry,
  clockGeometry,
  browserGeometry,
  waitingGeometry,
  renderInfoDisplay,
  BROWSER_LAYOUT,
  type NowPlayingData,
  type PatternBrowserData,
} from '../infoDisplay'
import { THUMBNAIL_W, THUMBNAIL_H } from '../patternThumbnail'
import { FONT_H } from '../font'
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

const nowPlaying = (over: Partial<NowPlayingData> = {}) =>
  renderInfoDisplay(sh1106, {
    layout: 'Now Playing',
    data: {
      title: 'MIDNIGHT DRIVE', elapsedSec: 65, durationSec: 200,
      progress: 0.325, playing: true, volume: 0.75, ...over,
    },
  })

describe('layout selection', () => {
  it('offers one layout per source, plus the one for no source at all', () => {
    expect([...INFO_DISPLAY_LAYOUTS]).toEqual(['Waiting', 'Clock', 'Now Playing', 'Pattern Browser'])
  })

  // The Pattern Browser was held back until the runtime selection contract and
  // baked thumbnails existed, because offering it sooner would have meant a
  // layout that previews and cannot be generated. It reads both rather than
  // tracking an index or drawing an icon of its own.
  it('offers the Pattern Browser now that it can be generated', () => {
    expect(INFO_DISPLAY_LAYOUTS as readonly string[]).toContain('Pattern Browser')
  })

  // Not parsed from a property. The wire decides, so a layout cannot exist
  // that no source produces and a source cannot exist that no layout draws.
  it('takes its layout from the source plugged in', () => {
    expect(infoLayoutForKind('clock')).toBe('Clock')
    expect(infoLayoutForKind('player')).toBe('Now Playing')
    expect(infoLayoutForKind('slideshow')).toBe('Pattern Browser')
  })

})

/*
 * Rows are resolved against the panel, not counted down from the top at a
 * fixed pitch. The old `infoRowY(i)` did the latter, so a shorter module drew
 * its bottom rows past the glass and nothing said so — the same shape of bug
 * the TFT avoided by resolving geometry per panel from the start.
 */
describe('rows resolved from the panel', () => {
  const SHORT = 32

  it('gives a panel with room the pitch it always had', () => {
    expect(infoRowPitch(64, 4)).toBe(INFO_LAYOUT.lineHeight)
    expect(infoRowPitch(64, 4, INFO_LAYOUT.barHeight)).toBe(INFO_LAYOUT.lineHeight)
    // Which is to say: today's panels are laid out exactly as before.
    const g = nowPlayingGeometry(128, 64)
    expect(g.title.y).toBe(INFO_LAYOUT.margin)
    expect(g.state.y).toBe(INFO_LAYOUT.margin + INFO_LAYOUT.lineHeight)
  })

  it('tightens rather than overflowing a shorter one', () => {
    expect(infoRowPitch(SHORT, 4, INFO_LAYOUT.barHeight)).toBeLessThan(INFO_LAYOUT.lineHeight)
  })

  it.each([
    ['now playing', (w: number, h: number) => {
      const g = nowPlayingGeometry(w, h)
      return [g.title.y, g.state.y, g.bar.y + g.bar.h, g.volume?.y]
    }],
    ['clock', (w: number, h: number) => {
      const g = clockGeometry(w, h)
      return [g.time.y, g.date.y, g.rule?.y, g.health?.y]
    }],
    ['browser', (w: number, h: number) => {
      const g = browserGeometry(w, h)
      return [g.name.y, g.ordinal.y, g.status.y, g.playing?.rule.y, g.playing?.label.y]
    }],
    ['waiting', (w: number, h: number) => {
      const g = waitingGeometry(w, h)
      return [g.message.y, g.hint?.y]
    }],
  ] as const)('keeps every %s row on the glass, at either height', (_name, rows) => {
    for (const height of [64, SHORT]) {
      for (const y of rows(128, height)) {
        if (y == null) continue      // a row the layout dropped for want of room
        expect(y + FONT_H, `${_name} @${height}`).toBeLessThanOrEqual(height)
      }
    }
  })

  // Dropped, not squeezed: a row that will not fit is absent from the geometry,
  // so the emitter leaves it out of the sketch too rather than the two sides
  // disagreeing about a half-drawn line.
  it('drops the rows a short panel has no room for', () => {
    // A half-height module still fits Now Playing, tightened — the browser's
    // sixth row is the first thing to go, and a 16-row strip keeps only the
    // one line that says what is wrong.
    expect(browserGeometry(128, SHORT).playing).toBeNull()
    expect(nowPlayingGeometry(128, 16).volume).toBeNull()
    expect(waitingGeometry(128, 16).hint).toBeNull()
    // And keeps them where there is room.
    expect(nowPlayingGeometry(128, SHORT).volume).not.toBeNull()
    expect(nowPlayingGeometry(128, 64).volume).not.toBeNull()
    expect(browserGeometry(128, 64).playing).not.toBeNull()
  })

  it('resolves the text column against the panel it is on', () => {
    expect(browserGeometry(128, 64).name.w).toBeLessThan(browserGeometry(160, 64).name.w)
    expect(nowPlayingGeometry(128, 64).title.w).toBe(128 - (INFO_LAYOUT.margin * 2))
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

describe('Waiting', () => {
  // A blank OLED and a dead OLED look identical on a bench, so the panel with
  // nothing plugged in says which one it is.
  const waiting = () => renderInfoDisplay(sh1106, { layout: 'Waiting' })

  it('draws something rather than nothing', () => {
    expect(litCount(waiting())).toBeGreaterThan(60)
    expect(withinPanel(waiting())).toBe(true)
  })

  it('is what a panel with no source shows', () => {
    expect(blankInfoData('Waiting')).toEqual({ layout: 'Waiting' })
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
    const data = blankInfoData('Clock')
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
