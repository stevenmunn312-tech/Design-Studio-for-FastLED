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
  drawBitmap, drawRect, fitOledText, oledTextWidth,
  type OledController, type OledSurface,
} from './oledSurface'
import { DISPLAY_WAITING_TEXT, type DisplaySignalKind } from './displaySignal'
import { FONT_H } from './font'
import { formatTransportTime } from './transportBridge'
import { THUMBNAIL_W, THUMBNAIL_H, type PatternThumbnail } from './patternThumbnail'

/**
 * The screens a panel can show, one per source it can be plugged into, plus
 * the one it shows when it is plugged into nothing.
 *
 * Not a property. `infoLayoutForKind` is the only way to pick one, so a layout
 * cannot exist that no source produces, and a source cannot exist that no
 * layout draws.
 */
export const INFO_DISPLAY_LAYOUTS = ['Waiting', 'Clock', 'Now Playing', 'Pattern Browser'] as const
export type InfoDisplayLayout = (typeof INFO_DISPLAY_LAYOUTS)[number]

const LAYOUT_BY_KIND: Record<DisplaySignalKind, InfoDisplayLayout> = {
  clock: 'Clock',
  player: 'Now Playing',
  slideshow: 'Pattern Browser',
}

/** The screen a plugged-in source produces. */
export function infoLayoutForKind(kind: DisplaySignalKind): InfoDisplayLayout {
  return LAYOUT_BY_KIND[kind]
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

export type InfoDisplayData =
  | { layout: 'Waiting' }
  | { layout: 'Now Playing'; data: NowPlayingData }
  | { layout: 'Clock'; data: ClockData }
  | { layout: 'Pattern Browser'; data: PatternBrowserData }

/**
 * Nothing is plugged in, and the panel says so.
 *
 * A blank OLED and a dead OLED look identical on a bench. Two rows rather than
 * one because the second names the port to look at, which is the whole of the
 * user's next move.
 */
export function drawWaiting(surface: OledSurface): void {
  const { margin } = INFO_LAYOUT
  const inner = surface.width - (margin * 2)
  const centred = (text: string, row: number) => {
    const fitted = fitOledText(text, inner)
    const x = Math.max(margin, ((surface.width - oledTextWidth(fitted)) / 2) | 0)
    drawOledText(surface, x, infoRowY(row), fitted)
  }
  centred(DISPLAY_WAITING_TEXT, 1)
  centred('WIRE A SOURCE TO DISPLAY', 3)
}

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

/** Render any layout onto a fresh surface for `controller`. */
export function renderInfoDisplay(controller: OledController, input: InfoDisplayData): OledSurface {
  const surface = createOledSurface(controller)
  clearOledSurface(surface)
  switch (input.layout) {
    case 'Waiting': drawWaiting(surface); break
    case 'Now Playing': drawNowPlaying(surface, input.data); break
    case 'Clock': drawClock(surface, input.data); break
    case 'Pattern Browser': drawPatternBrowser(surface, input.data); break
  }
  return surface
}

/**
 * Blank data for a layout whose source is plugged in but has nothing to say.
 *
 * A panel with nothing plugged in is not this: it draws `Waiting`, because
 * "no source" and "a source with no reading" are different facts and a bench
 * needs to tell them apart.
 */
export function blankInfoData(layout: InfoDisplayLayout): InfoDisplayData {
  switch (layout) {
    case 'Clock':
      return { layout, data: { timeText: '--:--', dateText: '', valid: false, synced: false } }
    case 'Pattern Browser':
      // Count 0 rather than a blank name: a browser with no collection says so
      // outright instead of drawing an empty frame that reads as a pattern
      // with no picture.
      return {
        layout,
        data: { name: '', ordinal: 0, count: 0, thumbnail: null, browsing: false, activeName: '' },
      }
    case 'Now Playing':
      return {
        layout,
        data: { title: '', elapsedSec: 0, durationSec: 0, progress: 0, playing: false, volume: 0 },
      }
    default:
      return { layout: 'Waiting' }
  }
}
