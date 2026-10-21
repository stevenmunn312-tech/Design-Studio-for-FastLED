import { describe, it, expect } from 'vitest'
import {
  TRANSPORT_DISPLAY_LAYOUTS,
  TRANSPORT_PICTURE_W,
  TRANSPORT_PICTURE_H,
  TRANSPORT_PICTURE_STRIP_RATIO,
  TRANSPORT_COLORS,
  TRANSPORT_METRICS,
  asTransportDisplayLayout,
  blankTransportData,
  diagnosticsGeometry,
  diagnosticsRawCoordinateText,
  drawTransportFixed,
  drawTransportNowPlaying,
  fixedTransportGeometry,
  nowPlayingGeometry,
  nowPlayingStateText,
  nowPlayingTimes,
  renderTransportDisplay,
  showStatusGeometry,
  showStatusOrdinalText,
  showStatusStateText,
  transportPictureBox,
  transportWaitingGeometry,
  type TransportNowPlayingData,
  type TransportFixedData,
  type TransportPictureFrame,
  type TransportShowStatusData,
} from '../transportDisplay'
import {
  TFT_CONTROLLERS, TFT_ROTATIONS, createTftSurface, clearTftSurface, getTftPixel, rgb565,
  fitTftText, tftRotatedSize, tftTextWidth, type TftRect, type TftSurface,
} from '../tftSurface'
import { DISPLAY_WAITING_TEXT } from '../displaySignal'

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
  progress: 0.325, playing: true, volume: 0.75, patternName: 'FIRE 2', picture: null, ...over,
})

const showStatus = (over: Partial<TransportShowStatusData> = {}): TransportShowStatusData => ({
  patternName: 'FIRE 2', patternIndex: 3, patternCount: 12,
  highlightName: 'AURORA', highlightIndex: 7, browsing: false, ...over,
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
  // Every fixed layout previews and emits through both firmware paths.
  // `Waiting` leads because it is what a panel shows before any source picks
  // one of the others, and it is generated like the rest rather than being a
  // browser-only placeholder.
  it('offers the eight layouts that can be generated', () => {
    expect([...TRANSPORT_DISPLAY_LAYOUTS]).toEqual([
      'Waiting', 'Clock', 'Now Playing', 'Fixed Transport', 'Show Status', 'LED Status', 'Power Monitor', 'Diagnostics',
    ])
  })

  it('falls back to Now Playing for anything else', () => {
    expect(asTransportDisplayLayout('Show Status')).toBe('Show Status')
    expect(asTransportDisplayLayout('Fixed Transport')).toBe('Fixed Transport')
    expect(asTransportDisplayLayout('Diagnostics')).toBe('Diagnostics')
    expect(asTransportDisplayLayout(undefined)).toBe('Now Playing')
  })
})

describe('waiting', () => {
  it.each(MOUNTED_SIZES)('says the whole message on a $key panel', ({ width, height }) => {
    // The one fixed string on any panel, and the only thing a bench has to go
    // on when nothing is wired. Truncated to "WAITING FOR A S..." it stops
    // being the message and becomes evidence of a second fault.
    const g = transportWaitingGeometry(width, height)
    expect(fitTftText(DISPLAY_WAITING_TEXT, g.message.w, g.message.scale))
      .toBe(DISPLAY_WAITING_TEXT)
  })

  it('keeps the message no smaller than the hint beneath it', () => {
    for (const { width, height } of MOUNTED_SIZES) {
      const g = transportWaitingGeometry(width, height)
      if (g.hint) expect(g.message.scale).toBeGreaterThanOrEqual(g.hint.scale)
    }
  })
})

describe('diagnostics', () => {
  it.each(MOUNTED_SIZES)('keeps both mapped and raw readings on a $key panel', ({ width, height }) => {
    const g = diagnosticsGeometry(width, height)
    expect(g.rawCoordinates.y).toBeGreaterThan(g.coordinates.y)
    expect(g.rawCoordinates.y + g.rawCoordinates.h).toBeLessThanOrEqual(height)
  })

  it('labels raw readings according to what the current runtime can know', () => {
    expect(diagnosticsRawCoordinateText({
      touchAvailable: true, pressed: true, x: 12, y: 34, rawX: 321, rawY: 3789,
    })).toBe('RAW 321  3789')
    expect(diagnosticsRawCoordinateText({
      touchAvailable: true, pressed: true, x: 12, y: 34,
    })).toBe('RAW DEVICE ONLY')
    expect(diagnosticsRawCoordinateText({
      touchAvailable: true, pressed: false, x: 0, y: 0,
    })).toBe('RAW --  --')
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
    const stack = [g.picture, g.title, g.artist, g.pattern, g.progress, g.elapsed, g.state]
    for (let i = 1; i < stack.length; i++) {
      expect(stack[i].y, `row ${i} starts below row ${i - 1}`)
        .toBeGreaterThanOrEqual(stack[i - 1].y + stack[i - 1].h)
    }
  })

  it.each(MOUNTED_SIZES)('stacks Show Status rows without overlap on $key', ({ width, height }) => {
    const g = showStatusGeometry(width, height)
    const stack = [g.pattern, g.ordinal, g.status, g.highlight, g.highlightOrdinal]
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

  // The browsing block is pinned to the bottom so the running pattern's rows
  // never move when a browse starts or ends — a layout that reflowed on every
  // encoder detent would be unreadable exactly when it is being used.
  it.each(MOUNTED_SIZES)('anchors the browsing block to the bottom of $key', ({ width, height }) => {
    const g = showStatusGeometry(width, height)
    expect(height - (g.highlightOrdinal.y + g.highlightOrdinal.h)).toBe(TRANSPORT_METRICS.margin)
  })

  it.each(MOUNTED_SIZES)('holds the running rows still while browsing on $key', ({ width, height }) => {
    const g = showStatusGeometry(width, height)
    expect(g.pattern.y).toBe(TRANSPORT_METRICS.margin)
    expect(g.status.y).toBeLessThan(g.highlight.y)
  })

  // The picture square is fixed, so the rows around it never move with what
  // the LEDs are.
  it.each(MOUNTED_SIZES)('fits the fixed picture square on $key', ({ width, height }) => {
    const g = nowPlayingGeometry(width, height)
    expect(g.picture.w).toBe(TRANSPORT_PICTURE_W)
    expect(g.picture.h).toBe(TRANSPORT_PICTURE_H)
    expect(g.picture.x + g.picture.w).toBeLessThanOrEqual(width)
    expect(g.picture.y + g.picture.h).toBeLessThanOrEqual(height)
  })

  // PLAY and PAUSE are different lengths, and a field sized to the shorter one
  // would slide the volume bar under it every time the transport changed.
  it('sizes the state field for the wider of the two words', () => {
    const g = nowPlayingGeometry(240, 240)
    expect(g.state.w).toBe(tftTextWidth('PAUSE', TRANSPORT_METRICS.bodyScale))
    expect(g.state.w).toBeGreaterThan(tftTextWidth('PLAY', TRANSPORT_METRICS.bodyScale))
  })

  // The same fixed square in the band between the running rows and the
  // browsing block, with clear space either side, so neither text block has
  // to move to make room for it.
  it.each(MOUNTED_SIZES)('fits the Show Status picture between its text blocks on $key', ({ width, height }) => {
    const g = showStatusGeometry(width, height)
    expect(g.picture.w).toBe(TRANSPORT_PICTURE_W)
    expect(g.picture.h).toBe(TRANSPORT_PICTURE_H)
    expect(g.picture.y).toBeGreaterThanOrEqual(g.status.y + g.status.h + TRANSPORT_METRICS.rowGap)
    expect(g.picture.y + g.picture.h + TRANSPORT_METRICS.rowGap).toBeLessThanOrEqual(g.highlight.y)
    // Centred across the glass, to the pixel the integer split allows.
    const left = g.picture.x
    const right = width - (g.picture.x + g.picture.w)
    expect(Math.abs(left - right)).toBeLessThanOrEqual(1)
  })

  // Pinned rather than only bounded: the firmware emits these literals, and a
  // silent shift would move a picture the preview and the device both draw.
  it('places the Show Status picture deliberately on every mounted size', () => {
    const at = (w: number, h: number) => {
      const { x, y } = showStatusGeometry(w, h).picture
      return [x, y]
    }
    expect(at(240, 240)).toEqual([72, 80])
    expect(at(240, 320)).toEqual([72, 120])
    expect(at(320, 240)).toEqual([112, 80])
  })

  it('gives the extra height of a taller panel to the picture block', () => {
    const square = nowPlayingGeometry(240, 240)
    const tall = nowPlayingGeometry(240, 320)
    expect(tall.picture.y).toBeGreaterThan(square.picture.y)
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

  it('names whether the panel is reporting or being browsed', () => {
    expect(showStatusStateText(false, 9)).toBe('PLAYING')
    expect(showStatusStateText(true, 9)).toBe('BROWSING')
  })

  it('says nothing about playing when there is no collection', () => {
    // The row above already reads NO PATTERNS; a PLAYING under it claims a
    // show the panel has just reported it does not have.
    expect(showStatusStateText(false, 0)).toBe('')
    expect(showStatusStateText(true, 0)).toBe('')
    expect(showStatusStateText(false, Number.NaN)).toBe('')
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
  it('frames the picture slot when there is no picture', () => {
    const g = nowPlayingGeometry(240, 240)
    const surface = renderTransportDisplay(st7789, '0', {
      layout: 'Now Playing', data: nowPlaying({ picture: null }),
    })
    expect(getTftPixel(surface, g.picture.x, g.picture.y)).toBe(TRANSPORT_COLORS.artFrame)
    expect(getTftPixel(surface, g.picture.x + 4, g.picture.y + 4)).toBe(TRANSPORT_COLORS.background)
  })

  it('draws the LEDs inside the frame, one block of pixels per LED', () => {
    const g = nowPlayingGeometry(240, 240)
    // 16x16 into the 94-pixel inside: five pixels an LED, centred.
    const picture = solidPicture(16, 16, { r: 255, g: 0, b: 0 })
    const surface = renderTransportDisplay(st7789, '0', {
      layout: 'Now Playing', data: nowPlaying({ picture }),
    })
    const box = transportPictureBox(16, 16, g.picture)
    expect(box).toEqual({ x: g.picture.x + 8, y: g.picture.y + 8, w: 80, h: 80 })
    expect(getTftPixel(surface, g.picture.x, g.picture.y)).toBe(TRANSPORT_COLORS.artFrame)
    expect(getTftPixel(surface, box.x, box.y)).toBe(rgb565(255, 0, 0))
    expect(getTftPixel(surface, box.x + box.w - 1, box.y + box.h - 1)).toBe(rgb565(255, 0, 0))
    expect(getTftPixel(surface, box.x - 1, box.y)).toBe(TRANSPORT_COLORS.background)
  })

  // The picture follows the slideshow's LEDs, and Show Status without one is
  // its text-only self — no empty frame — with every text row where it was.
  it('pictures Show Status at its rect, and nothing without a picture', () => {
    const g = showStatusGeometry(240, 240)
    const picture = solidPicture(8, 8, { r: 255, g: 255, b: 255 })
    const pictured = renderTransportDisplay(st7789, '0', {
      layout: 'Show Status', data: showStatus({ picture }),
    })
    const box = transportPictureBox(8, 8, g.picture)
    expect(getTftPixel(pictured, box.x, box.y)).toBe(0xffff)
    expect(getTftPixel(pictured, g.picture.x, g.picture.y)).toBe(TRANSPORT_COLORS.artFrame)
    expect(getTftPixel(pictured, g.picture.x - 1, g.picture.y)).toBe(TRANSPORT_COLORS.background)
    const textOnly = renderTransportDisplay(st7789, '0', {
      layout: 'Show Status', data: showStatus({ picture: null }),
    })
    for (let y = g.picture.y; y < g.picture.y + g.picture.h; y++) {
      for (let x = g.picture.x; x < g.picture.x + g.picture.w; x++) {
        expect(getTftPixel(textOnly, x, y)).toBe(TRANSPORT_COLORS.background)
      }
    }
    // The text rows are where the text-only layout put them.
    for (let y = g.pattern.y; y < g.pattern.y + g.pattern.h; y++) {
      for (let x = g.pattern.x; x < g.pattern.x + g.pattern.w; x++) {
        expect(getTftPixel(pictured, x, y)).toBe(getTftPixel(textOnly, x, y))
      }
    }
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

  // Blank rather than skipped: painting the empty field is what clears the
  // previous candidate off the glass when a browse ends. Skipping it would
  // leave the last browsed pattern on the panel indefinitely.
  it('clears the browsing rows when a browse ends', () => {
    const g = showStatusGeometry(240, 240)
    const browsing = renderTransportDisplay(st7789, '0', {
      layout: 'Show Status', data: showStatus({ browsing: true }),
    })
    const settled = renderTransportDisplay(st7789, '0', {
      layout: 'Show Status', data: showStatus({ browsing: false }),
    })
    const rowLit = (surface: TftSurface, rect: TftRect) => {
      for (let y = rect.y; y < rect.y + rect.h; y++) {
        for (let x = rect.x; x < rect.x + rect.w; x++) {
          if (getTftPixel(surface, x, y) !== TRANSPORT_COLORS.background) return true
        }
      }
      return false
    }
    expect(rowLit(browsing, g.highlight)).toBe(true)
    expect(rowLit(browsing, g.highlightOrdinal)).toBe(true)
    expect(rowLit(settled, g.highlight)).toBe(false)
    expect(rowLit(settled, g.highlightOrdinal)).toBe(false)
  })

  // The running rows are what the panel is for, so they say the same thing
  // whether or not someone is turning the encoder.
  it('keeps reporting the running pattern while browsing', () => {
    const g = showStatusGeometry(240, 240)
    const browsing = renderTransportDisplay(st7789, '0', {
      layout: 'Show Status', data: showStatus({ browsing: true }),
    })
    const settled = renderTransportDisplay(st7789, '0', {
      layout: 'Show Status', data: showStatus({ browsing: false }),
    })
    for (let y = g.pattern.y; y < g.pattern.y + g.pattern.h; y++) {
      for (let x = g.pattern.x; x < g.pattern.x + g.pattern.w; x++) {
        expect(getTftPixel(browsing, x, y)).toBe(getTftPixel(settled, x, y))
      }
    }
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

describe('the LEDs\' picture', () => {
  const frame = { x: 10, y: 20, w: 96, h: 96 }

  it('fits a grid at whole pixels per LED, centred inside the border', () => {
    expect(transportPictureBox(16, 16, frame)).toEqual({ x: 18, y: 28, w: 80, h: 80 })
    // Wider than tall, still a picture: 32x8 at two pixels an LED.
    expect(transportPictureBox(32, 8, frame)).toEqual({ x: 26, y: 60, w: 64, h: 16 })
    // Bigger than the frame: shrunk to fit rather than cropped.
    expect(transportPictureBox(200, 200, frame)).toEqual({ x: 11, y: 21, w: 94, h: 94 })
  })

  it('fills the frame with a strip, each LED a band across it', () => {
    const inside = { x: 11, y: 21, w: 94, h: 94 }
    expect(transportPictureBox(60, 1, frame)).toEqual(inside)
    expect(transportPictureBox(1, 144, frame)).toEqual(inside)
    expect(transportPictureBox(TRANSPORT_PICTURE_STRIP_RATIO, 1, frame)).not.toEqual(inside)
  })

  it('draws each panel pixel from the LED under it', () => {
    const g = nowPlayingGeometry(240, 240)
    const picture: TransportPictureFrame = [[{ r: 255, g: 0, b: 0 }, { r: 0, g: 0, b: 255 }]]
    const surface = renderTransportDisplay(st7789, '0', { layout: 'Now Playing', data: nowPlaying({ picture }) })
    const box = transportPictureBox(2, 1, g.picture)
    expect(getTftPixel(surface, box.x, box.y)).toBe(rgb565(255, 0, 0))
    expect(getTftPixel(surface, box.x + box.w - 1, box.y + box.h - 1)).toBe(rgb565(0, 0, 255))
  })
})

function solidPicture(width: number, height: number, color: { r: number; g: number; b: number }): TransportPictureFrame {
  return Array.from({ length: height }, () => Array.from({ length: width }, () => color))
}
