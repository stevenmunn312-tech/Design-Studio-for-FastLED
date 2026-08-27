import { describe, it, expect } from 'vitest'
import {
  TRANSPORT_DISPLAY_LAYOUTS,
  TRANSPORT_ARTWORK_W,
  TRANSPORT_ARTWORK_H,
  TRANSPORT_ARTWORK_BYTES,
  TRANSPORT_BEAT_COUNT,
  TRANSPORT_COLORS,
  TRANSPORT_METRICS,
  MAX_TRANSPORT_ARTWORKS,
  asTransportDisplayLayout,
  blankTransportData,
  drawTransportFixed,
  drawTransportNowPlaying,
  fixedTransportGeometry,
  nowPlayingGeometry,
  nowPlayingStateText,
  nowPlayingTimes,
  renderTransportDisplay,
  showStatusBeatIndex,
  showStatusBpmText,
  showStatusGeometry,
  showStatusOrdinalText,
  showStatusOutputText,
  transportArtworkBudgetIssue,
  transportArtworkFlashCost,
  type TransportNowPlayingData,
  type TransportFixedData,
  type TransportShowStatusData,
} from '../transportDisplay'
import {
  TFT_CONTROLLERS, TFT_ROTATIONS, createTftSurface, clearTftSurface, getTftPixel,
  tftRotatedSize, tftTextWidth, type TftRect, type TftSurface,
} from '../tftSurface'
import { DISPLAY_TEXT_NO_READING } from '../displayText'

const st7789 = TFT_CONTROLLERS.ST7789
const st7789v = TFT_CONTROLLERS.ST7789V

/** Every size either catalogued panel can be mounted at. */
const MOUNTED_SIZES = [...new Set(
  [st7789, st7789v].flatMap((controller) => TFT_ROTATIONS.map((rotation) => {
    const size = tftRotatedSize(controller, rotation)
    return `${size.width}x${size.height}`
  })),
)].map((key) => {
  const [width, height] = key.split('x').map(Number)
  return { key, width, height }
})

const nowPlaying = (over: Partial<TransportNowPlayingData> = {}): TransportNowPlayingData => ({
  title: 'MIDNIGHT DRIVE', artist: 'THE LONG WAY', elapsedSec: 65, durationSec: 200,
  progress: 0.325, playing: true, volume: 0.75, patternName: 'FIRE 2', artwork: null, ...over,
})

const showStatus = (over: Partial<TransportShowStatusData> = {}): TransportShowStatusData => ({
  patternName: 'FIRE 2', patternIndex: 3, patternCount: 12, section: 'CHORUS',
  bpm: 128, beat: 2, outputEnabled: true, brightness: 0.6, ...over,
})

const fixedTransport = (over: Partial<TransportFixedData> = {}): TransportFixedData => ({
  title: 'MIDNIGHT DRIVE', patternName: 'FIRE 2', playing: true, volume: 0.75, ...over,
})

function litCount(surface: TftSurface): number {
  let n = 0
  for (let y = 0; y < surface.height; y++) {
    for (let x = 0; x < surface.width; x++) if (getTftPixel(surface, x, y) !== TRANSPORT_COLORS.background) n++
  }
  return n
}

/** Every rectangle a layout resolved, so the invariants can sweep them all. */
function rectsOf(geometry: object): Array<[string, TftRect]> {
  return Object.entries(geometry).filter((entry): entry is [string, TftRect] => {
    const value = entry[1] as TftRect | undefined
    return !!value && typeof value === 'object'
      && typeof value.x === 'number' && typeof value.y === 'number'
      && typeof value.w === 'number' && typeof value.h === 'number'
  })
}

describe('layout selection', () => {
  // Diagnostics remains generated-only; these are the three user-selectable
  // layouts that preview and emit through both firmware paths.
  it('offers the three layouts that can be generated', () => {
    expect([...TRANSPORT_DISPLAY_LAYOUTS]).toEqual(['Now Playing', 'Fixed Transport', 'Show Status'])
  })

  it('falls back to Now Playing for anything else', () => {
    expect(asTransportDisplayLayout('Show Status')).toBe('Show Status')
    expect(asTransportDisplayLayout('Fixed Transport')).toBe('Fixed Transport')
    expect(asTransportDisplayLayout('Diagnostics')).toBe('Now Playing')
    expect(asTransportDisplayLayout(undefined)).toBe('Now Playing')
  })
})

describe('geometry across every mounted size', () => {
  // A 1-bit panel is always 128x64, so INFO_LAYOUT can be flat constants. This
  // one has four sizes to satisfy, which is why the geometry is a function —
  // and why the generator calls the same function rather than restating it.
  it('covers both catalogued panels in every rotation', () => {
    expect(MOUNTED_SIZES.map((size) => size.key).sort())
      .toEqual(['240x240', '240x320', '320x240'])
  })

  it.each(MOUNTED_SIZES)('keeps Now Playing inside a $key panel', ({ width, height }) => {
    for (const [name, rect] of rectsOf(nowPlayingGeometry(width, height))) {
      expect(rect.x, `${name}.x`).toBeGreaterThanOrEqual(0)
      expect(rect.y, `${name}.y`).toBeGreaterThanOrEqual(0)
      expect(rect.x + rect.w, `${name} right edge`).toBeLessThanOrEqual(width)
      expect(rect.y + rect.h, `${name} bottom edge`).toBeLessThanOrEqual(height)
      expect(rect.w, `${name}.w`).toBeGreaterThan(0)
    }
  })

  it.each(MOUNTED_SIZES)('keeps Show Status inside a $key panel', ({ width, height }) => {
    for (const [name, rect] of rectsOf(showStatusGeometry(width, height))) {
      expect(rect.x, `${name}.x`).toBeGreaterThanOrEqual(0)
      expect(rect.y, `${name}.y`).toBeGreaterThanOrEqual(0)
      expect(rect.x + rect.w, `${name} right edge`).toBeLessThanOrEqual(width)
      expect(rect.y + rect.h, `${name} bottom edge`).toBeLessThanOrEqual(height)
      expect(rect.w, `${name}.w`).toBeGreaterThan(0)
    }
  })

  it.each(MOUNTED_SIZES)('keeps Fixed Transport inside a $key panel', ({ width, height }) => {
    const g = fixedTransportGeometry(width, height)
    for (const [name, rect] of [
      ['title', g.title], ['pattern', g.pattern], ['previous', g.previous.rect],
      ['playPause', g.playPause.rect], ['next', g.next.rect],
      ['volumeLabel', g.volumeLabel], ['volume', g.volume],
    ] as Array<[string, TftRect]>) {
      expect(rect.x, `${name}.x`).toBeGreaterThanOrEqual(0)
      expect(rect.y, `${name}.y`).toBeGreaterThanOrEqual(0)
      expect(rect.x + rect.w, `${name} right edge`).toBeLessThanOrEqual(width)
      expect(rect.y + rect.h, `${name} bottom edge`).toBeLessThanOrEqual(height)
    }
  })

  it.each(MOUNTED_SIZES)('gives every transport button a finger-sized target on $key', ({ width, height }) => {
    const g = fixedTransportGeometry(width, height)
    for (const button of [g.previous, g.playPause, g.next]) {
      expect(button.rect.w).toBeGreaterThanOrEqual(44)
      expect(button.rect.h).toBeGreaterThanOrEqual(44)
    }
  })

  // Fields erase their own cells, so two that overlap would fight every frame
  // and the loser would flicker.
  it.each(MOUNTED_SIZES)('stacks Now Playing rows without overlap on $key', ({ width, height }) => {
    const g = nowPlayingGeometry(width, height)
    const stack = [g.artwork, g.title, g.artist, g.pattern, g.progress, g.elapsed, g.state]
    for (let i = 1; i < stack.length; i++) {
      expect(stack[i].y, `row ${i} starts below row ${i - 1}`)
        .toBeGreaterThanOrEqual(stack[i - 1].y + stack[i - 1].h)
    }
  })

  it.each(MOUNTED_SIZES)('stacks Show Status rows without overlap on $key', ({ width, height }) => {
    const g = showStatusGeometry(width, height)
    const stack = [g.pattern, g.ordinal, g.section, g.bpm, g.beats, g.output, g.brightness]
    for (let i = 1; i < stack.length; i++) {
      expect(stack[i].y, `row ${i} starts below row ${i - 1}`)
        .toBeGreaterThanOrEqual(stack[i - 1].y + stack[i - 1].h)
    }
  })

  // The times row and the transport row are what the eye goes to, so they sit
  // the same distance off the bottom edge whatever the panel's height.
  it.each(MOUNTED_SIZES)('anchors the transport block to the bottom of $key', ({ width, height }) => {
    const g = nowPlayingGeometry(width, height)
    expect(height - (g.state.y + g.state.h)).toBe(TRANSPORT_METRICS.margin)
    expect(height - (g.volume.y + g.volume.h)).toBe(TRANSPORT_METRICS.margin)
  })

  it.each(MOUNTED_SIZES)('anchors the brightness bar to the bottom of $key', ({ width, height }) => {
    const g = showStatusGeometry(width, height)
    expect(height - (g.brightness.y + g.brightness.h)).toBe(TRANSPORT_METRICS.margin)
  })

  // Artwork is fixed at 96 square because the bytes are baked in the browser
  // and only blitted on the device. A panel it did not fit would need a scaler
  // in C++, which is the one thing this must never grow.
  it.each(MOUNTED_SIZES)('fits the fixed artwork square on $key', ({ width, height }) => {
    const g = nowPlayingGeometry(width, height)
    expect(g.artwork.w).toBe(TRANSPORT_ARTWORK_W)
    expect(g.artwork.h).toBe(TRANSPORT_ARTWORK_H)
    expect(g.artwork.x + g.artwork.w).toBeLessThanOrEqual(width)
    expect(g.artwork.y + g.artwork.h).toBeLessThanOrEqual(height)
  })

  // PLAY and PAUSE are different lengths, and a field sized to the shorter one
  // would slide the volume bar under it every time the transport changed.
  it('sizes the state field for the wider of the two words', () => {
    const g = nowPlayingGeometry(240, 240)
    expect(g.state.w).toBe(tftTextWidth('PAUSE', TRANSPORT_METRICS.bodyScale))
    expect(g.state.w).toBeGreaterThan(tftTextWidth('PLAY', TRANSPORT_METRICS.bodyScale))
  })

  it('gives the extra height of a taller panel to the artwork block', () => {
    const square = nowPlayingGeometry(240, 240)
    const tall = nowPlayingGeometry(240, 320)
    expect(tall.artwork.y).toBeGreaterThan(square.artwork.y)
  })

  it('divides a bar into four beats', () => {
    expect(showStatusGeometry(240, 240).beatCount).toBe(TRANSPORT_BEAT_COUNT)
    expect(TRANSPORT_BEAT_COUNT).toBe(4)
  })
})

describe('what the fields say', () => {
  it('formats times the way the transport bridge does everywhere else', () => {
    expect(nowPlayingTimes(nowPlaying())).toEqual({ elapsed: '1:05', duration: '3:20' })
  })

  // A word, not a glyph: the shared 3x5 font has no triangle, and inventing
  // one here would be a glyph the firmware does not have.
  it('says the transport state in words', () => {
    expect(nowPlayingStateText(true)).toBe('PLAY')
    expect(nowPlayingStateText(false)).toBe('PAUSE')
  })

  it('counts the pattern from one for a reader', () => {
    expect(showStatusOrdinalText(0, 12)).toBe('1/12')
    expect(showStatusOrdinalText(3, 12)).toBe('4/12')
  })

  // A lone 1/0 on a panel is worse than being told the wire is not carrying a
  // show, which is the same refusal the Pattern Browser makes.
  it('says so rather than inventing an ordinal with no collection', () => {
    expect(showStatusOrdinalText(0, 0)).toBe('NO PATTERNS')
    expect(showStatusOrdinalText(4, -2)).toBe('NO PATTERNS')
  })

  it('clamps an index past the end of the collection', () => {
    expect(showStatusOrdinalText(99, 12)).toBe('12/12')
    expect(showStatusOrdinalText(-4, 12)).toBe('1/12')
  })

  // Dashes rather than 0: a show with no tempo and a show stopped dead are
  // different things and only one of them is a fault.
  it('marks a tempo it has no reading for', () => {
    expect(showStatusBpmText(128)).toBe('128')
    expect(showStatusBpmText(127.6)).toBe('128')
    expect(showStatusBpmText(0)).toBe(DISPLAY_TEXT_NO_READING)
    expect(showStatusBpmText(Number.NaN)).toBe(DISPLAY_TEXT_NO_READING)
    expect(showStatusBpmText(Number.POSITIVE_INFINITY)).toBe(DISPLAY_TEXT_NO_READING)
  })

  it('wraps the beat marker at both ends of the bar', () => {
    expect(showStatusBeatIndex(0)).toBe(0)
    expect(showStatusBeatIndex(2.75)).toBe(2)
    expect(showStatusBeatIndex(4)).toBe(0)
    expect(showStatusBeatIndex(-1)).toBe(3)
    expect(showStatusBeatIndex(Number.NaN)).toBe(0)
  })

  it('names the output state in full', () => {
    expect(showStatusOutputText(true)).toBe('OUTPUT ON')
    expect(showStatusOutputText(false)).toBe('OUTPUT OFF')
  })
})

describe('rendering', () => {
  it.each(MOUNTED_SIZES)('draws Now Playing on a $key panel', ({ width, height }) => {
    const surface = createTftSurface(width, height)
    clearTftSurface(surface, TRANSPORT_COLORS.background)
    drawTransportNowPlaying(surface, nowPlaying())
    expect(litCount(surface)).toBeGreaterThan(0)
  })

  it.each(MOUNTED_SIZES)('draws Fixed Transport on a $key panel', ({ width, height }) => {
    const surface = createTftSurface(width, height)
    clearTftSurface(surface, TRANSPORT_COLORS.background)
    drawTransportFixed(surface, fixedTransport())
    expect(litCount(surface)).toBeGreaterThan(0)
  })

  it('highlights the active pause button', () => {
    const g = fixedTransportGeometry(240, 240)
    const surface = renderTransportDisplay(st7789, '0', {
      layout: 'Fixed Transport', data: fixedTransport({ playing: true }),
    })
    expect(getTftPixel(surface, g.playPause.rect.x + 2, g.playPause.rect.y + 2))
      .toBe(TRANSPORT_COLORS.accent)
  })

  it('renders through a controller and its mounted rotation', () => {
    const surface = renderTransportDisplay(st7789v, '90', {
      layout: 'Show Status', data: showStatus(),
    })
    expect([surface.width, surface.height]).toEqual([320, 240])
    expect(litCount(surface)).toBeGreaterThan(0)
  })

  // An empty frame rather than a black square, so a track with no baked art
  // reads as a missing picture instead of as art that renders black — which
  // plenty legitimately does.
  it('frames the artwork slot when nothing was baked', () => {
    const g = nowPlayingGeometry(240, 240)
    const surface = renderTransportDisplay(st7789, '0', {
      layout: 'Now Playing', data: nowPlaying({ artwork: null }),
    })
    expect(getTftPixel(surface, g.artwork.x, g.artwork.y)).toBe(TRANSPORT_COLORS.artFrame)
    expect(getTftPixel(surface, g.artwork.x + 4, g.artwork.y + 4)).toBe(TRANSPORT_COLORS.background)
  })

  it('blits baked artwork over the frame', () => {
    const g = nowPlayingGeometry(240, 240)
    const artwork = new Uint8Array(TRANSPORT_ARTWORK_BYTES)
    artwork.fill(0xff)
    const surface = renderTransportDisplay(st7789, '0', {
      layout: 'Now Playing', data: nowPlaying({ artwork }),
    })
    expect(getTftPixel(surface, g.artwork.x + 4, g.artwork.y + 4)).toBe(0xffff)
  })

  it('draws a long title inside its field rather than across the panel', () => {
    const g = nowPlayingGeometry(240, 240)
    const surface = renderTransportDisplay(st7789, '0', {
      layout: 'Now Playing',
      data: nowPlaying({ title: 'A TITLE FAR LONGER THAN ANY PANEL COULD SHOW AT THIS SIZE' }),
    })
    for (let y = g.title.y; y < g.title.y + g.title.h; y++) {
      expect(getTftPixel(surface, g.title.x + g.title.w, y)).toBe(TRANSPORT_COLORS.background)
    }
  })

  it('colours the output row by what the lights are doing', () => {
    const g = showStatusGeometry(240, 240)
    const on = renderTransportDisplay(st7789, '0', {
      layout: 'Show Status', data: showStatus({ outputEnabled: true }),
    })
    const off = renderTransportDisplay(st7789, '0', {
      layout: 'Show Status', data: showStatus({ outputEnabled: false }),
    })
    const rowColors = (surface: TftSurface) => {
      const seen = new Set<number>()
      for (let y = g.output.y; y < g.output.y + g.output.h; y++) {
        for (let x = g.output.x; x < g.output.x + g.output.w; x++) seen.add(getTftPixel(surface, x, y))
      }
      return seen
    }
    expect(rowColors(on).has(TRANSPORT_COLORS.on)).toBe(true)
    expect(rowColors(off).has(TRANSPORT_COLORS.off)).toBe(true)
  })

  it('lights exactly one beat marker', () => {
    const g = showStatusGeometry(240, 240)
    const surface = renderTransportDisplay(st7789, '0', {
      layout: 'Show Status', data: showStatus({ beat: 2 }),
    })
    const filled = [0, 1, 2, 3].filter((i) => {
      const x = g.beats.x + (i * (g.beatSize + g.beatGap)) + Math.floor(g.beatSize / 2)
      return getTftPixel(surface, x, g.beats.y + Math.floor(g.beatSize / 2)) === TRANSPORT_COLORS.accent
    })
    expect(filled).toEqual([2])
  })

  it('renders blank data for an unwired node without throwing', () => {
    for (const layout of TRANSPORT_DISPLAY_LAYOUTS) {
      const data = blankTransportData(layout)
      expect(data.layout).toBe(layout)
      expect(() => renderTransportDisplay(st7789, '0', data)).not.toThrow()
    }
  })

  it('says there is no collection when a Show Status panel is unwired', () => {
    const data = blankTransportData('Show Status')
    expect(data.layout).toBe('Show Status')
    if (data.layout !== 'Show Status') return
    expect(showStatusOrdinalText(data.data.patternIndex, data.data.patternCount)).toBe('NO PATTERNS')
  })
})

describe('artwork budget', () => {
  // Colour art is expensive in a way 1-bit thumbnails are not: one picture is
  // more flash than a whole collection of them.
  it('costs two bytes a pixel', () => {
    expect(TRANSPORT_ARTWORK_BYTES).toBe(TRANSPORT_ARTWORK_W * TRANSPORT_ARTWORK_H * 2)
    expect(transportArtworkFlashCost(3)).toBe(TRANSPORT_ARTWORK_BYTES * 3)
    expect(transportArtworkFlashCost(-1)).toBe(0)
    expect(transportArtworkFlashCost(Number.NaN)).toBe(0)
  })

  it('accepts a build inside the cap', () => {
    expect(transportArtworkBudgetIssue(0)).toBeNull()
    expect(transportArtworkBudgetIssue(MAX_TRANSPORT_ARTWORKS)).toBeNull()
  })

  // Said in bytes the user can act on rather than as a bare refusal: flash
  // otherwise runs out during someone else's build, long after the art was
  // chosen.
  it('names the cost when a build is over the cap', () => {
    const issue = transportArtworkBudgetIssue(MAX_TRANSPORT_ARTWORKS + 1)
    expect(issue).toContain(String(MAX_TRANSPORT_ARTWORKS))
    expect(issue).toContain(String(transportArtworkFlashCost(MAX_TRANSPORT_ARTWORKS + 1)))
    expect(issue).toContain('Show Status')
  })
})
