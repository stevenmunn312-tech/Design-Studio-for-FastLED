// The fixed layouts an `InfoDisplay` can show.
//
// Pure functions from data to pixels. The evaluator calls them to draw the node
// body and the browser preview; the C++ generator emits the same geometry
// constants and calls the same primitives on the device. Neither side computes
// a position the other has to guess at — that is what "shared pure layout
// helpers rather than separate preview and C++ geometry guesses" means in the
// plan, and it is the only way a 128x64 panel matches its preview.
//
// The Pattern Browser layout waited on two things — the runtime
// pattern-selection contract in `patternSelection.ts` and baked 1-bit
// thumbnails in `patternThumbnail.ts` — because half-building it would have
// meant a layout that renders in preview and cannot be generated. It reads
// both rather than tracking an index or drawing an icon of its own.

import {
  createOledSurface, clearOledSurface, drawOledText, drawProgressBar, drawHLine,
  drawIndicator, drawBitmap, drawRect, fitOledText, oledTextWidth,
  type OledController, type OledSurface,
} from './oledSurface'
import { FONT_H } from './font'
import { formatTransportTime } from './transportBridge'
import { THUMBNAIL_W, THUMBNAIL_H, type PatternThumbnail } from './patternThumbnail'

export const INFO_DISPLAY_LAYOUTS = ['Now Playing', 'Clock', 'Status', 'Pattern Browser'] as const
export type InfoDisplayLayout = (typeof INFO_DISPLAY_LAYOUTS)[number]

export function asInfoDisplayLayout(value: unknown): InfoDisplayLayout {
  const layout = String(value ?? '')
  return (INFO_DISPLAY_LAYOUTS as readonly string[]).includes(layout)
    ? (layout as InfoDisplayLayout)
    : 'Now Playing'
}

/**
 * Layout geometry, in pixels from the top-left.
 *
 * Exported so the generator emits these exact numbers rather than restating
 * them. A margin typed twice is a margin that disagrees.
 */
export const INFO_LAYOUT = {
  margin: 2,
  /** Baseline pitch: glyph height plus a row of breathing space. */
  lineHeight: FONT_H + 3,
  barHeight: 7,
  indicatorSize: 5,
} as const

/** Top-left y of row `index`, counting from the content area. */
export function infoRowY(index: number): number {
  return INFO_LAYOUT.margin + (index * INFO_LAYOUT.lineHeight)
}

export interface NowPlayingData {
  title: string
  elapsedSec: number
  durationSec: number
  progress: number
  playing: boolean
  volume: number
}

export interface ClockData {
  timeText: string
  dateText: string
  valid: boolean
  synced: boolean
}

export interface StatusData {
  line1: string
  line2: string
  value: string
  progress: number
  indicators: readonly boolean[]
}

export type InfoDisplayData =
  | { layout: 'Now Playing'; data: NowPlayingData }
  | { layout: 'Clock'; data: ClockData }
  | { layout: 'Status'; data: StatusData }
  | { layout: 'Pattern Browser'; data: PatternBrowserData }

/**
 * Now Playing: title, transport state, elapsed/duration, and a progress bar.
 *
 * The title is fitted to the panel rather than clipped, so a long track name
 * ends in an ellipsis at a glyph boundary instead of a half-drawn letter.
 */
export function drawNowPlaying(surface: OledSurface, data: NowPlayingData): void {
  const { margin } = INFO_LAYOUT
  const inner = surface.width - (margin * 2)

  drawOledText(surface, margin, infoRowY(0), fitOledText(data.title, inner))

  // Play state as a word rather than a glyph: the shared 3x5 font has no
  // triangle, and inventing one here would be a glyph the firmware lacks.
  const state = data.playing ? 'PLAY' : 'PAUSE'
  drawOledText(surface, margin, infoRowY(1), state)

  const times = `${formatTransportTime(data.elapsedSec)}/${formatTransportTime(data.durationSec)}`
  const timesWidth = oledTextWidth(times)
  drawOledText(surface, surface.width - margin - timesWidth, infoRowY(1), times)

  drawProgressBar(surface, margin, infoRowY(2) + 1, inner, INFO_LAYOUT.barHeight, data.progress)

  const volume = `VOL ${Math.round(Math.max(0, Math.min(1, data.volume)) * 100)}`
  drawOledText(surface, margin, infoRowY(3) + INFO_LAYOUT.barHeight, fitOledText(volume, inner))
}


/**
 * Where the Pattern Browser puts its picture.
 *
 * `y: 0` rather than an even margin, because a thumbnail is four whole pages
 * and starting it on a page boundary makes the device-side blit a byte copy
 * per column instead of a shift per pixel. A picture bleeding to the top edge
 * costs nothing to look at; the shift would cost every frame.
 */
export const BROWSER_LAYOUT = {
  thumbX: INFO_LAYOUT.margin,
  thumbY: 0,
  /** Left edge of the text column, clear of the picture. */
  textX: INFO_LAYOUT.margin + THUMBNAIL_W + 3,
} as const

export interface PatternBrowserData {
  /** Name of the pattern being looked at, which is not always the one playing. */
  name: string
  /** 1-based position of the highlight. 0 when the collection is empty. */
  ordinal: number
  count: number
  /** The highlighted pattern's baked thumbnail, or null when it has none. */
  thumbnail: PatternThumbnail | null
  /** True while the highlight has moved off the pattern that is running. */
  browsing: boolean
  /** What is actually on the LEDs, shown only while browsing away from it. */
  activeName: string
}

/**
 * Pattern Browser: a picture of the pattern you are about to choose.
 *
 * The split between highlight and active is the whole point, and the panel has
 * to show it or the split is invisible: the picture and name are what you are
 * *looking at*, and while that is not what is running the bottom strip says
 * what is. Without that line, scrolling away from the playing pattern leaves a
 * panel confidently describing something the LEDs are not doing.
 */
export function drawPatternBrowser(surface: OledSurface, data: PatternBrowserData): void {
  const { margin } = INFO_LAYOUT
  const inner = surface.width - BROWSER_LAYOUT.textX - margin

  if (data.count <= 0) {
    drawOledText(surface, margin, infoRowY(1), 'NO PATTERNS')
    return
  }

  // An outline where the picture goes, so a pattern whose thumbnail did not
  // bake reads as a missing picture rather than as a pattern that renders
  // black — which several legitimately do.
  if (data.thumbnail) {
    drawBitmap(surface, BROWSER_LAYOUT.thumbX, BROWSER_LAYOUT.thumbY,
               data.thumbnail.width, data.thumbnail.height, data.thumbnail.data)
  } else {
    drawRect(surface, BROWSER_LAYOUT.thumbX, BROWSER_LAYOUT.thumbY, THUMBNAIL_W, THUMBNAIL_H)
  }

  drawOledText(surface, BROWSER_LAYOUT.textX, infoRowY(0), fitOledText(data.name, inner))

  const ordinal = `${data.ordinal}/${data.count}`
  drawOledText(surface, BROWSER_LAYOUT.textX, infoRowY(1), fitOledText(ordinal, inner))

  // A word, not a glyph: the shared 3x5 font has no tick or triangle, and
  // inventing one here would be a glyph the firmware does not have.
  drawOledText(surface, BROWSER_LAYOUT.textX, infoRowY(2), data.browsing ? 'SELECT?' : 'PLAYING')

  if (!data.browsing) return
  drawHLine(surface, margin, infoRowY(4), surface.width - (margin * 2))
  const playing = fitOledText(`PLAYING ${data.activeName}`, surface.width - (margin * 2))
  drawOledText(surface, margin, infoRowY(5), playing)
}

/**
 * Clock: the time large-ish, the date under it, and the reading's health.
 *
 * An invalid or unsynced clock says so in words. The alternative — showing the
 * time anyway — is a display confidently reporting a time nobody should act on,
 * which is the failure the dashed masks elsewhere exist to prevent.
 */
export function drawClock(surface: OledSurface, data: ClockData): void {
  const { margin } = INFO_LAYOUT
  const inner = surface.width - (margin * 2)

  const timeWidth = oledTextWidth(data.timeText)
  drawOledText(surface, Math.max(margin, (surface.width - timeWidth) / 2 | 0), infoRowY(0), data.timeText)

  const dateWidth = oledTextWidth(data.dateText)
  drawOledText(surface, Math.max(margin, (surface.width - dateWidth) / 2 | 0), infoRowY(1), data.dateText)

  drawHLine(surface, margin, infoRowY(2) + 1, inner)

  const health = !data.valid ? 'NO CLOCK' : data.synced ? 'SYNCED' : 'NOT SYNCED'
  drawOledText(surface, margin, infoRowY(3), fitOledText(health, inner))
}

/**
 * Status: two text rows, a value, a bar, and up to four indicators.
 *
 * Four is the cap because five 5px markers plus their gaps no longer fit beside
 * the value on a 128px row, and a layout that silently drops the fifth is worse
 * than one that never offers it.
 */
export const STATUS_MAX_INDICATORS = 4

export function drawStatus(surface: OledSurface, data: StatusData): void {
  const { margin, indicatorSize } = INFO_LAYOUT
  const inner = surface.width - (margin * 2)

  drawOledText(surface, margin, infoRowY(0), fitOledText(data.line1, inner))
  drawOledText(surface, margin, infoRowY(1), fitOledText(data.line2, inner))

  const valueWidth = oledTextWidth(data.value)
  drawOledText(surface, surface.width - margin - valueWidth, infoRowY(2), data.value)

  const indicators = data.indicators.slice(0, STATUS_MAX_INDICATORS)
  for (let i = 0; i < indicators.length; i++) {
    drawIndicator(surface, margin + (i * (indicatorSize + 2)), infoRowY(2), indicators[i], indicatorSize)
  }

  drawProgressBar(surface, margin, infoRowY(3) + 2, inner, INFO_LAYOUT.barHeight, data.progress)
}

/** Render any layout onto a fresh surface for `controller`. */
export function renderInfoDisplay(controller: OledController, input: InfoDisplayData): OledSurface {
  const surface = createOledSurface(controller)
  clearOledSurface(surface)
  switch (input.layout) {
    case 'Now Playing': drawNowPlaying(surface, input.data); break
    case 'Clock': drawClock(surface, input.data); break
    case 'Status': drawStatus(surface, input.data); break
    case 'Pattern Browser': drawPatternBrowser(surface, input.data); break
  }
  return surface
}

/** Blank data per layout, for an unwired node or a disabled panel. */
export function blankInfoData(layout: InfoDisplayLayout): InfoDisplayData {
  switch (layout) {
    case 'Clock':
      return { layout, data: { timeText: '--:--', dateText: '', valid: false, synced: false } }
    case 'Status':
      return { layout, data: { line1: '', line2: '', value: '', progress: 0, indicators: [] } }
    case 'Pattern Browser':
      // Count 0 rather than a blank name: an unwired browser has no collection,
      // which the layout says outright instead of drawing an empty frame that
      // reads as a pattern with no picture.
      return {
        layout,
        data: { name: '', ordinal: 0, count: 0, thumbnail: null, browsing: false, activeName: '' },
      }
    default:
      return {
        layout: 'Now Playing',
        data: { title: '', elapsedSec: 0, durationSec: 0, progress: 0, playing: false, volume: 0 },
      }
  }
}
