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
 * What the layouts are drawn from, in pixels.
 *
 * Preferred rather than fixed: `lineHeight` is the pitch a panel with room
 * uses, and a shorter one tightens toward `FONT_H + 1`. Exported so the
 * generator resolves the same numbers rather than restating them — a margin
 * typed twice is a margin that disagrees.
 */
export const INFO_LAYOUT = {
  margin: 2,
  /** Baseline pitch: glyph height plus a row of breathing space. */
  lineHeight: FONT_H + 3,
  barHeight: 7,
} as const

export interface InfoRect {
  x: number
  y: number
  w: number
  h: number
}

/** A row of text: a box whose height is one glyph. */
export interface InfoField {
  x: number
  y: number
  w: number
}

/**
 * The pitch a layout's rows get on a panel of this height.
 *
 * Resolved rather than constant, which is the whole point of the geometry
 * functions below: `infoRowY(i)` counted down from the top at a fixed pitch, so
 * a shorter module drew its bottom rows past the glass and nothing said so.
 * Every catalogued OLED is 128x64 today and gets exactly the pitch it always
 * had — the preferred one — because the fit only ever tightens.
 *
 * `reserve` is space the layout needs *below* its last row, which only the
 * progress bar has.
 */
export function infoRowPitch(height: number, rows: number, reserve = 0): number {
  const usable = height - INFO_LAYOUT.margin - reserve
  const fit = Math.floor(usable / Math.max(1, rows))
  // A row still has to hold a glyph and a pixel of air under it. Below that the
  // layout has run out of panel, which the geometry says by dropping rows
  // rather than by overlapping them.
  return Math.max(FONT_H + 1, Math.min(INFO_LAYOUT.lineHeight, fit))
}

/** Whether a row at `y` is wholly on a panel of this height. */
function fits(y: number, height: number, rowHeight = FONT_H): boolean {
  return y + rowHeight <= height
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

/** Fixed product identity at the top of every lifecycle card. */
export const INFO_BOOT_TITLE = 'Design Studio for FastLED'

/** Minimum time each generated setup milestone remains readable. */
export const INFO_BOOT_STAGE_MIN_MS = 500

/**
 * Device-lifecycle information shown before the wired source takes over, or
 * for as long as a runtime fault remains. This is deliberately not another
 * `InfoDisplayLayout`: boot and faults are an appliance overlay, not graph
 * content and not another source a cable can select.
 */
export interface InfoBootStatusData {
  subtitle: string
  state: string
  detail: string
  meta: string
}

export interface BootStatusGeometry {
  title: InfoField
  subtitle: InfoField | null
  rule: InfoRect | null
  state: InfoField
  detail: InfoField | null
  meta: InfoField | null
}

/**
 * A compact appliance card for startup and runtime failures.
 *
 * Rows disappear from the bottom on a short panel. The state itself never
 * disappears: on a tiny screen, knowing STARTING/READY/FAULT matters more than
 * the project identity or diagnostic detail around it.
 */
export function bootStatusGeometry(width: number, height: number): BootStatusGeometry {
  const { margin } = INFO_LAYOUT
  const inner = width - (margin * 2)
  const pitch = infoRowPitch(height, 6)
  const row = (index: number) => margin + (index * pitch)
  const field = (index: number): InfoField | null =>
    fits(row(index), height) ? { x: margin, y: row(index), w: inner } : null
  return {
    title: { x: margin, y: row(0), w: inner },
    subtitle: field(1),
    rule: fits(row(2), height, 1) ? { x: margin, y: row(2), w: inner, h: 1 } : null,
    // A 16-row display has room for rows 0 and 1 only. Put the state in that
    // second surviving row and let the device identity be the first detail to
    // go; the 32/64-row panels still get the full ordering below.
    state: height < row(3) + FONT_H
      ? { x: margin, y: row(1), w: inner }
      : { x: margin, y: row(3), w: inner },
    detail: field(4),
    meta: field(5),
  }
}

/** Draw the same boot/fault card the generated OLED firmware emits. */
export function drawBootStatus(surface: OledSurface, data: InfoBootStatusData): void {
  const g = bootStatusGeometry(surface.width, surface.height)
  const centred = (field: InfoField, text: string) => {
    const fitted = fitOledText(text, field.w)
    const x = Math.max(field.x, ((surface.width - oledTextWidth(fitted)) / 2) | 0)
    drawOledText(surface, x, field.y, fitted)
  }
  centred(g.title, INFO_BOOT_TITLE)
  if (g.subtitle && g.subtitle.y !== g.state.y) centred(g.subtitle, data.subtitle)
  if (g.rule) drawHLine(surface, g.rule.x, g.rule.y, g.rule.w)
  centred(g.state, data.state)
  if (g.detail) centred(g.detail, data.detail)
  if (g.meta) centred(g.meta, data.meta)
}

/** Render a lifecycle card on the same controller surface as normal content. */
export function renderInfoBootStatus(controller: OledController, data: InfoBootStatusData): OledSurface {
  const surface = createOledSurface(controller)
  clearOledSurface(surface)
  drawBootStatus(surface, data)
  return surface
}

export type InfoDisplayData =
  | { layout: 'Waiting' }
  | { layout: 'Now Playing'; data: NowPlayingData }
  | { layout: 'Clock'; data: ClockData }
  | { layout: 'Pattern Browser'; data: PatternBrowserData }

export interface WaitingGeometry {
  message: InfoField
  /** Dropped on a panel with no room for a second row. */
  hint: InfoField | null
}

/**
 * Nothing is plugged in, and the panel says so.
 *
 * A blank OLED and a dead OLED look identical on a bench. Two rows rather than
 * one because the second names the port to look at, which is the whole of the
 * user's next move — and on a panel too short for both, the message is the one
 * that survives.
 */
export function waitingGeometry(width: number, height: number): WaitingGeometry {
  const { margin } = INFO_LAYOUT
  const inner = width - (margin * 2)
  const pitch = infoRowPitch(height, 4)
  const hintY = margin + (pitch * 3)
  return {
    message: { x: margin, y: margin + pitch, w: inner },
    hint: fits(hintY, height) ? { x: margin, y: hintY, w: inner } : null,
  }
}

export function drawWaiting(surface: OledSurface): void {
  const g = waitingGeometry(surface.width, surface.height)
  const centred = (field: InfoField, text: string) => {
    const fitted = fitOledText(text, field.w)
    const x = Math.max(field.x, ((surface.width - oledTextWidth(fitted)) / 2) | 0)
    drawOledText(surface, x, field.y, fitted)
  }
  centred(g.message, DISPLAY_WAITING_TEXT)
  if (g.hint) centred(g.hint, 'WIRE A SOURCE TO DISPLAY')
}

export interface NowPlayingGeometry {
  title: InfoField
  state: InfoField
  /** Right-aligned against the panel edge; x is the field's left bound. */
  times: InfoField
  bar: InfoRect
  /** Dropped on a panel with no room under the bar. */
  volume: InfoField | null
}

/**
 * Now Playing: title, transport state, elapsed/duration, and a progress bar.
 *
 * The bar reserves its own height below the row it sits on, so the volume row
 * under it is placed against a panel that has already accounted for it.
 */
export function nowPlayingGeometry(width: number, height: number): NowPlayingGeometry {
  const { margin, barHeight } = INFO_LAYOUT
  const inner = width - (margin * 2)
  const pitch = infoRowPitch(height, 4, barHeight)
  const row = (index: number) => margin + (index * pitch)
  const volumeY = row(3) + barHeight
  return {
    title: { x: margin, y: row(0), w: inner },
    state: { x: margin, y: row(1), w: inner },
    times: { x: margin, y: row(1), w: inner },
    bar: { x: margin, y: row(2) + 1, w: inner, h: barHeight },
    volume: fits(volumeY, height) ? { x: margin, y: volumeY, w: inner } : null,
  }
}

/**
 * The title is fitted to the panel rather than clipped, so a long track name
 * ends in an ellipsis at a glyph boundary instead of a half-drawn letter.
 */
export function drawNowPlaying(surface: OledSurface, data: NowPlayingData): void {
  const g = nowPlayingGeometry(surface.width, surface.height)

  drawOledText(surface, g.title.x, g.title.y, fitOledText(data.title, g.title.w))

  // Play state as a word rather than a glyph: the shared 3x5 font has no
  // triangle, and inventing one here would be a glyph the firmware lacks.
  drawOledText(surface, g.state.x, g.state.y, data.playing ? 'PLAY' : 'PAUSE')

  const times = `${formatTransportTime(data.elapsedSec)}/${formatTransportTime(data.durationSec)}`
  drawOledText(surface, g.times.x + g.times.w - oledTextWidth(times), g.times.y, times)

  drawProgressBar(surface, g.bar.x, g.bar.y, g.bar.w, g.bar.h, data.progress)

  if (!g.volume) return
  const volume = `VOL ${Math.round(Math.max(0, Math.min(1, data.volume)) * 100)}`
  drawOledText(surface, g.volume.x, g.volume.y, fitOledText(volume, g.volume.w))
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
export interface BrowserGeometry {
  thumb: InfoRect
  name: InfoField
  ordinal: InfoField
  status: InfoField
  /** The row "NO PATTERNS" goes on, which is the text column's second. */
  empty: InfoField
  /**
   * The strip naming what is *running* while you browse away from it, and the
   * rule above it. Null on a panel with no room: the split is worth showing,
   * but not at the cost of a half-drawn row over the picture.
   */
  playing: { rule: InfoRect; label: InfoField } | null
}

export function browserGeometry(width: number, height: number): BrowserGeometry {
  const { margin } = INFO_LAYOUT
  const textX = BROWSER_LAYOUT.textX
  const column = width - textX - margin
  const inner = width - (margin * 2)
  const pitch = infoRowPitch(height, 6)
  const row = (index: number) => margin + (index * pitch)
  const ruleY = row(4)
  const labelY = row(5)
  return {
    thumb: { x: BROWSER_LAYOUT.thumbX, y: BROWSER_LAYOUT.thumbY, w: THUMBNAIL_W, h: THUMBNAIL_H },
    name: { x: textX, y: row(0), w: column },
    ordinal: { x: textX, y: row(1), w: column },
    status: { x: textX, y: row(2), w: column },
    empty: { x: margin, y: row(1), w: inner },
    playing: fits(labelY, height)
      ? { rule: { x: margin, y: ruleY, w: inner, h: 1 }, label: { x: margin, y: labelY, w: inner } }
      : null,
  }
}

export function drawPatternBrowser(surface: OledSurface, data: PatternBrowserData): void {
  const g = browserGeometry(surface.width, surface.height)

  if (data.count <= 0) {
    drawOledText(surface, g.empty.x, g.empty.y, 'NO PATTERNS')
    return
  }

  // An outline where the picture goes, so a pattern whose thumbnail did not
  // bake reads as a missing picture rather than as a pattern that renders
  // black — which several legitimately do.
  if (data.thumbnail) {
    drawBitmap(surface, g.thumb.x, g.thumb.y,
               data.thumbnail.width, data.thumbnail.height, data.thumbnail.data)
  } else {
    drawRect(surface, g.thumb.x, g.thumb.y, g.thumb.w, g.thumb.h)
  }

  drawOledText(surface, g.name.x, g.name.y, fitOledText(data.name, g.name.w))

  const ordinal = `${data.ordinal}/${data.count}`
  drawOledText(surface, g.ordinal.x, g.ordinal.y, fitOledText(ordinal, g.ordinal.w))

  // A word, not a glyph: the shared 3x5 font has no tick or triangle, and
  // inventing one here would be a glyph the firmware does not have.
  drawOledText(surface, g.status.x, g.status.y, data.browsing ? 'SELECT?' : 'PLAYING')

  if (!data.browsing || !g.playing) return
  drawHLine(surface, g.playing.rule.x, g.playing.rule.y, g.playing.rule.w)
  const playing = fitOledText(`PLAYING ${data.activeName}`, g.playing.label.w)
  drawOledText(surface, g.playing.label.x, g.playing.label.y, playing)
}

/**
 * Clock: the time large-ish, the date under it, and the reading's health.
 *
 * An invalid or unsynced clock says so in words. The alternative — showing the
 * time anyway — is a display confidently reporting a time nobody should act on,
 * which is the failure the dashed masks elsewhere exist to prevent.
 */
export interface ClockGeometry {
  time: InfoField
  date: InfoField
  /** Dropped with the health row it underlines. */
  rule: InfoRect | null
  health: InfoField | null
}

export function clockGeometry(width: number, height: number): ClockGeometry {
  const { margin } = INFO_LAYOUT
  const inner = width - (margin * 2)
  const pitch = infoRowPitch(height, 4)
  const row = (index: number) => margin + (index * pitch)
  const healthY = row(3)
  const shown = fits(healthY, height)
  return {
    time: { x: margin, y: row(0), w: inner },
    date: { x: margin, y: row(1), w: inner },
    rule: shown ? { x: margin, y: row(2) + 1, w: inner, h: 1 } : null,
    health: shown ? { x: margin, y: healthY, w: inner } : null,
  }
}

export function drawClock(surface: OledSurface, data: ClockData): void {
  const g = clockGeometry(surface.width, surface.height)
  const centred = (field: InfoField, text: string) =>
    drawOledText(surface, Math.max(field.x, (surface.width - oledTextWidth(text)) / 2 | 0), field.y, text)

  centred(g.time, data.timeText)
  centred(g.date, data.dateText)

  if (g.rule) drawHLine(surface, g.rule.x, g.rule.y, g.rule.w)
  if (!g.health) return
  const health = !data.valid ? 'NO CLOCK' : data.synced ? 'SYNCED' : 'NOT SYNCED'
  drawOledText(surface, g.health.x, g.health.y, fitOledText(health, g.health.w))
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
