// The fixed layouts a `TransportDisplay` can show.
//
// The colour twin of state/infoDisplay.ts, and it works the same way: pure
// functions from data to pixels, with the geometry exported so the C++
// generator emits these exact numbers rather than restating them. A margin
// typed twice is a margin that disagrees, and on a 240-pixel panel that is
// visible from across the room.
//
// One difference from the OLED module is worth stating, because it is why the
// geometry is a function rather than a table of constants. A 1-bit panel is
// always 128x64. A colour panel is 240x240 or 240x320, and rotation swaps the
// axes, so the same layout has to resolve against four sizes. Resolving it
// once here — and letting the generator call the same function with the
// panel's mounted size — is what keeps the preview and the firmware honest;
// `INFO_LAYOUT`'s flat constants would have needed the numbers written out
// again for every size.
//
// Everything a field can say goes through state/displayText.ts, so truncation,
// unsupported characters and "no reading" markers behave the way they do
// everywhere else in the app.

import {
  createTftSurfaceFor, clearTftSurface, drawTftField, drawTftBar,
  drawTftArtwork, drawTftRect, fillTftRect, rgb565, tftTextHeight, tftTextWidth,
  type TftController, type TftField, type TftRect, type TftRotation, type TftSurface,
} from './tftSurface'
import { formatTransportTime } from './transportBridge'
import { displayString } from './displayText'
import { DISPLAY_WAITING_TEXT, type DisplaySignalKind } from './displaySignal'

export const TRANSPORT_DISPLAY_LAYOUTS = [
  'Waiting', 'Clock', 'Now Playing', 'Fixed Transport', 'Show Status', 'Diagnostics',
] as const
export type TransportDisplayLayout = (typeof TRANSPORT_DISPLAY_LAYOUTS)[number]

export function asTransportDisplayLayout(value: unknown): TransportDisplayLayout {
  const layout = String(value ?? '')
  return (TRANSPORT_DISPLAY_LAYOUTS as readonly string[]).includes(layout)
    ? (layout as TransportDisplayLayout)
    : 'Now Playing'
}

/**
 * The treatments each source offers, most-detailed first.
 *
 * The colour twin of `infoLayoutForKind`, with one difference that is the
 * whole reason this is a list rather than a single layout: a large panel has
 * room to say the same thing two ways. Now Playing and Fixed Transport are
 * both a player, so the *source* cannot choose between them and a property
 * has to — but only ever within the row the source already picked. That is
 * what keeps `tftLayout` a presentation choice instead of a content one: it
 * can change how a player screen is drawn and can never make a player screen
 * show a slideshow.
 *
 * `clock` offers exactly one treatment, the same way `slideshow` does — a
 * clock is not two different screens depending on taste, it is one reading
 * drawn large.
 */
const TRANSPORT_LAYOUTS_BY_KIND: Record<DisplaySignalKind, readonly TransportDisplayLayout[]> = {
  clock: ['Clock'],
  player: ['Now Playing', 'Fixed Transport'],
  slideshow: ['Show Status'],
}

/** Whether a source has any colour layout at all. */
export function transportSupportsKind(kind: DisplaySignalKind): boolean {
  return TRANSPORT_LAYOUTS_BY_KIND[kind].length > 0
}

/**
 * The screen a plugged-in source produces, honouring `treatment` when the
 * source offers more than one and the property names one of them.
 *
 * Null means this source has no colour layout, which the caller reports and
 * draws as `Waiting`. A treatment belonging to another kind is ignored rather
 * than rejected: switching a panel from a Slideshow to a Music Player leaves
 * `Show Status` behind in the property, and falling back to the source's own
 * first treatment is the reading that matches what is actually plugged in.
 */
export function transportLayoutForKind(
  kind: DisplaySignalKind,
  treatment?: unknown,
): TransportDisplayLayout | null {
  const offered = TRANSPORT_LAYOUTS_BY_KIND[kind]
  if (offered.length === 0) return null
  const named = String(treatment ?? '')
  return offered.find((layout) => layout === named) ?? offered[0]
}

// ── Shared metrics ──────────────────────────────────────────────────────────

/**
 * The pixel vocabulary both layouts are built from.
 *
 * Text scales are integer repeats of the shared 3x5 font: 2 is a readable
 * body row at arm's length on a 240-pixel panel and 3 is a heading. Anything
 * finer would need a second font in flash and a second glyph table to keep in
 * step with the LED matrix.
 */
export const TRANSPORT_METRICS = {
  margin: 8,
  /** Vertical gap between stacked rows. */
  rowGap: 6,
  bodyScale: 2,
  headingScale: 3,
  barHeight: 12,
  /** Space between the artwork and the text under it. */
  artGap: 12,
} as const

/**
 * Artwork size, in pixels.
 *
 * Square and fixed. Fixed because the bytes are baked in the browser and only
 * blitted on the device (see `drawTftArtwork`), so a panel that wanted another
 * size would need a scaler in C++ — the exact second implementation the
 * thumbnail rule exists to prevent. 96 leaves room under it for three text
 * rows and the transport block on the shortest catalogued panel.
 */
export const TRANSPORT_ARTWORK_W = 96
export const TRANSPORT_ARTWORK_H = 96

/** Render larger before averaging so one-pixel pattern features survive. */
export const TRANSPORT_ARTWORK_SUPERSAMPLE = 2

/** Fixed export tick, for reproducible artwork across builds. */
export const TRANSPORT_ARTWORK_TICK_SEC = 2.5

/** Flash one baked artwork costs: RGB565, two bytes a pixel. */
export const TRANSPORT_ARTWORK_BYTES = TRANSPORT_ARTWORK_W * TRANSPORT_ARTWORK_H * 2

interface ArtworkRgbLike { r: number; g: number; b: number }
type ArtworkFrameLike = readonly (readonly ArtworkRgbLike[])[]

/** A black, correctly-sized picture for a missing pattern group. */
export function blankTransportArtwork(): Uint8Array {
  return new Uint8Array(TRANSPORT_ARTWORK_BYTES)
}

/**
 * Downsample a rendered pattern into the exact big-endian RGB565 bytes sent
 * to the panel. Conversion lives only here; firmware blits these bytes.
 */
export function transportArtworkFromFrame(
  frame: ArtworkFrameLike,
  scale = TRANSPORT_ARTWORK_SUPERSAMPLE,
): Uint8Array {
  const out = blankTransportArtwork()
  const step = Math.max(1, Math.round(scale))
  let at = 0
  for (let y = 0; y < TRANSPORT_ARTWORK_H; y++) {
    for (let x = 0; x < TRANSPORT_ARTWORK_W; x++) {
      let r = 0
      let g = 0
      let b = 0
      let count = 0
      for (let sy = 0; sy < step; sy++) {
        const row = frame[(y * step) + sy]
        if (!row) continue
        for (let sx = 0; sx < step; sx++) {
          const pixel = row[(x * step) + sx]
          if (!pixel) continue
          r += pixel.r
          g += pixel.g
          b += pixel.b
          count++
        }
      }
      const color = count > 0 ? rgb565(r / count, g / count, b / count) : 0
      out[at++] = (color >> 8) & 0xff
      out[at++] = color & 0xff
    }
  }
  return out
}

/**
 * How many baked artworks a build will carry.
 *
 * Colour art is expensive in a way 1-bit thumbnails are not: one 96x96 picture
 * is 18 KB, which is more than a whole collection of `MAX_THUMBNAILS`
 * thumbnails. Eight is 144 KB — affordable beside a player sketch, and past
 * that the collection has outgrown a single fixed now-playing screen anyway.
 */
export const MAX_TRANSPORT_ARTWORKS = 8
export const MAX_TRANSPORT_ARTWORK_FLASH_BYTES = MAX_TRANSPORT_ARTWORKS * TRANSPORT_ARTWORK_BYTES

/** Flash cost of `count` baked artworks, in bytes. */
export function transportArtworkFlashCost(count: number): number {
  const n = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0
  return n * TRANSPORT_ARTWORK_BYTES
}

/**
 * Why a build cannot carry this much artwork, or null when it can.
 *
 * Said in bytes the user can act on rather than as a bare refusal, mirroring
 * `thumbnailBudgetIssue`: the point of a cap is that flash otherwise runs out
 * during someone else's build, long after the art was chosen.
 */
export function transportArtworkBudgetIssue(count: number): string | null {
  const n = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0
  if (n <= MAX_TRANSPORT_ARTWORKS) return null
  return `A Transport Display can carry ${MAX_TRANSPORT_ARTWORKS} baked artworks `
    + `(${MAX_TRANSPORT_ARTWORK_FLASH_BYTES} bytes of flash); this build wants ${n}, `
    + `which would need ${transportArtworkFlashCost(n)} bytes. `
    + 'Trim the artwork, or use the Show Status layout, which names patterns without picturing them.'
}

/**
 * The panel's colours, packed once.
 *
 * Named for their role rather than their hue so a later theme changes one
 * table. Dark ground and light text because the panel sits beside running
 * LEDs, where a white screen is the brightest thing in the room.
 */
export const TRANSPORT_COLORS = {
  background: rgb565(0, 0, 0),
  text: rgb565(255, 255, 255),
  /** Secondary rows: present, but not competing with the title. */
  dim: rgb565(150, 150, 158),
  accent: rgb565(0, 208, 224),
  /** A bar's unfilled interior, which is painted rather than left alone. */
  track: rgb565(40, 44, 52),
  outline: rgb565(90, 96, 106),
  on: rgb565(64, 220, 120),
  off: rgb565(226, 72, 72),
  /** Where artwork would be, when a pattern has none baked. */
  artFrame: rgb565(60, 64, 72),
} as const

const M = TRANSPORT_METRICS

function field(x: number, y: number, w: number, scale: number, align: TftField['align']): TftField {
  return { x, y, w, h: tftTextHeight(scale), scale, align }
}

// ── Waiting ─────────────────────────────────────────────────────────────────

export interface TransportWaitingGeometry {
  message: TftField
  /** Dropped on a panel with no room for a second row. */
  hint: TftField | null
}

/**
 * Nothing is plugged in, and the panel says so.
 *
 * Same reasoning as the OLED's waiting screen: a blank panel and a dead panel
 * look identical on a bench, and the one that tells you which costs nothing.
 * The second row names the port to look at, which is the whole of the user's
 * next move.
 *
 * Both rows are centred as a block on the glass rather than pinned to the top
 * margin. A colour panel is large enough that a two-row message in the corner
 * reads as a rendering fault rather than as a message.
 */
export function transportWaitingGeometry(width: number, height: number): TransportWaitingGeometry {
  const inner = width - (M.margin * 2)
  const messageH = tftTextHeight(M.headingScale)
  const hintH = tftTextHeight(M.bodyScale)
  const both = messageH + M.rowGap + hintH
  const roomForHint = both + (M.margin * 2) <= height
  const blockH = roomForHint ? both : messageH
  const top = Math.max(M.margin, ((height - blockH) / 2) | 0)
  return {
    message: field(M.margin, top, inner, M.headingScale, 'center'),
    hint: roomForHint
      ? field(M.margin, top + messageH + M.rowGap, inner, M.bodyScale, 'center')
      : null,
  }
}

export function drawTransportWaiting(surface: TftSurface): void {
  const g = transportWaitingGeometry(surface.width, surface.height)
  const c = TRANSPORT_COLORS
  drawTftField(surface, g.message, DISPLAY_WAITING_TEXT, c.text, c.background)
  if (g.hint) drawTftField(surface, g.hint, 'WIRE A SOURCE TO DISPLAY', c.dim, c.background)
}

// ── Now Playing ─────────────────────────────────────────────────────────────

export interface TransportNowPlayingData {
  title: string
  artist: string
  elapsedSec: number
  durationSec: number
  /** 0-1; clamped where it is drawn, not where it arrives. */
  progress: number
  playing: boolean
  /** 0-1. */
  volume: number
  patternName: string
  /** Baked RGB565 artwork, big-endian pairs, or null when none was baked. */
  artwork: Uint8Array | null
}

export interface NowPlayingGeometry {
  artwork: TftRect
  title: TftField
  artist: TftField
  pattern: TftField
  progress: TftRect
  elapsed: TftField
  duration: TftField
  state: TftField
  volumeLabel: TftField
  volume: TftRect
}

/** Widest state word, so the field never resizes between PLAY and PAUSE. */
const STATE_WORDS = ['PLAY', 'PAUSE'] as const
const VOLUME_LABEL = 'VOL'

/**
 * Resolve the Now Playing layout for a panel of this size.
 *
 * The transport block is anchored to the bottom and the artwork block is
 * centred in what is left above it. A 240x320 panel therefore gets its extra
 * eighty pixels as breathing room around the artwork rather than as a band of
 * dead space at one end, and every panel puts elapsed/duration and the bar in
 * the same place relative to the bottom edge — which is where the eye looks
 * for them.
 */
export function nowPlayingGeometry(width: number, height: number): NowPlayingGeometry {
  const inner = width - (M.margin * 2)
  const bodyH = tftTextHeight(M.bodyScale)
  const headingH = tftTextHeight(M.headingScale)

  // Bottom-anchored, upwards: transport row, times row, progress bar.
  const stateY = height - M.margin - bodyH
  const timesY = stateY - M.rowGap - bodyH
  const progressY = timesY - M.rowGap - M.barHeight

  // The artwork and its three text rows, centred in the space that remains.
  const groupH = TRANSPORT_ARTWORK_H + M.artGap + headingH + M.rowGap + bodyH + M.rowGap + bodyH
  const region = progressY - M.margin
  const topY = M.margin + Math.max(0, Math.floor((region - groupH) / 2))

  const artX = M.margin + Math.max(0, Math.floor((inner - TRANSPORT_ARTWORK_W) / 2))
  const titleY = topY + TRANSPORT_ARTWORK_H + M.artGap
  const artistY = titleY + headingH + M.rowGap
  const patternY = artistY + bodyH + M.rowGap

  // The transport row is a fixed state word, a label, and the bar that takes
  // whatever is left. Sized from the widest word so PLAY and PAUSE do not
  // move the volume bar under them.
  const stateW = Math.max(...STATE_WORDS.map((word) => tftTextWidth(word, M.bodyScale)))
  const volumeLabelX = M.margin + stateW + M.rowGap
  const volumeLabelW = tftTextWidth(VOLUME_LABEL, M.bodyScale)
  const volumeX = volumeLabelX + volumeLabelW + M.rowGap

  const halfTimes = Math.floor(inner / 2)

  return {
    artwork: { x: artX, y: topY, w: TRANSPORT_ARTWORK_W, h: TRANSPORT_ARTWORK_H },
    title: field(M.margin, titleY, inner, M.headingScale, 'center'),
    artist: field(M.margin, artistY, inner, M.bodyScale, 'center'),
    pattern: field(M.margin, patternY, inner, M.bodyScale, 'center'),
    progress: { x: M.margin, y: progressY, w: inner, h: M.barHeight },
    elapsed: field(M.margin, timesY, halfTimes, M.bodyScale, 'left'),
    duration: field(M.margin + halfTimes, timesY, inner - halfTimes, M.bodyScale, 'right'),
    state: field(M.margin, stateY, stateW, M.bodyScale, 'left'),
    volumeLabel: field(volumeLabelX, stateY, volumeLabelW, M.bodyScale, 'left'),
    // The volume bar is one body row tall rather than `barHeight`, so the
    // bottom margin stays a margin instead of being a pixel short of one.
    volume: { x: volumeX, y: stateY, w: width - M.margin - volumeX, h: bodyH },
  }
}

/** Elapsed and duration as the transport bridge writes them everywhere else. */
export function nowPlayingTimes(data: TransportNowPlayingData): { elapsed: string; duration: string } {
  return {
    elapsed: formatTransportTime(data.elapsedSec),
    duration: formatTransportTime(data.durationSec),
  }
}

/** The word the transport state shows. A word, because the font has no triangle. */
export function nowPlayingStateText(playing: boolean): string {
  return playing ? STATE_WORDS[0] : STATE_WORDS[1]
}

/**
 * Now Playing: artwork, what is playing, where it is up to, and the transport.
 *
 * The pattern name sits with the track rather than in a corner, because on
 * this appliance the pattern and the song are one thing the user is looking
 * at: the LEDs are running that pattern to that track.
 */
export function drawTransportNowPlaying(surface: TftSurface, data: TransportNowPlayingData): void {
  const g = nowPlayingGeometry(surface.width, surface.height)
  const c = TRANSPORT_COLORS

  // An empty frame where the picture goes, so a track with no baked art reads
  // as a missing picture rather than as art that happens to be black — which
  // plenty legitimately is.
  if (data.artwork && data.artwork.length > 0) {
    drawTftArtwork(surface, g.artwork.x, g.artwork.y, g.artwork.w, g.artwork.h, data.artwork)
  } else {
    fillTftRect(surface, g.artwork.x, g.artwork.y, g.artwork.w, g.artwork.h, c.background)
    drawTftRect(surface, g.artwork.x, g.artwork.y, g.artwork.w, g.artwork.h, c.artFrame)
  }

  drawTftField(surface, g.title, displayString(data.title), c.text, c.background)
  drawTftField(surface, g.artist, displayString(data.artist), c.dim, c.background)
  drawTftField(surface, g.pattern, displayString(data.patternName), c.accent, c.background)

  drawTftBar(surface, g.progress, data.progress, c.accent, c.track, c.outline)

  const times = nowPlayingTimes(data)
  drawTftField(surface, g.elapsed, times.elapsed, c.text, c.background)
  drawTftField(surface, g.duration, times.duration, c.dim, c.background)

  drawTftField(surface, g.state, nowPlayingStateText(data.playing), c.text, c.background)
  drawTftField(surface, g.volumeLabel, VOLUME_LABEL, c.dim, c.background)
  drawTftBar(surface, g.volume, data.volume, c.text, c.track, c.outline)
}

// ── Fixed Transport ─────────────────────────────────────────────────────────

export interface TransportFixedData {
  title: string
  patternName: string
  playing: boolean
  volume: number
}

export interface TransportButtonGeometry {
  rect: TftRect
  label: TftField
}

export interface FixedTransportGeometry {
  title: TftField
  pattern: TftField
  previous: TransportButtonGeometry
  playPause: TransportButtonGeometry
  next: TransportButtonGeometry
  volumeLabel: TftField
  volume: TftRect
}

/** Three finger-sized transport buttons and one absolute volume control. */
export function fixedTransportGeometry(width: number, height: number): FixedTransportGeometry {
  const inner = width - (M.margin * 2)
  const headingH = tftTextHeight(M.headingScale)
  const bodyH = tftTextHeight(M.bodyScale)
  const titleY = M.margin
  const patternY = titleY + headingH + M.rowGap
  const volumeY = height - M.margin - M.barHeight
  const volumeLabelW = tftTextWidth(VOLUME_LABEL, M.bodyScale)
  const volumeX = M.margin + volumeLabelW + M.rowGap
  const buttonsTop = patternY + bodyH + (M.rowGap * 2)
  const buttonsBottom = volumeY - (M.rowGap * 2)
  const buttonH = Math.max(44, Math.min(64, buttonsBottom - buttonsTop))
  const buttonY = buttonsTop + Math.max(0, Math.floor((buttonsBottom - buttonsTop - buttonH) / 2))
  const gap = M.rowGap
  const buttonW = Math.floor((inner - (gap * 2)) / 3)
  const widths = [buttonW, buttonW, inner - (buttonW * 2) - (gap * 2)]
  const xs = [M.margin, M.margin + buttonW + gap, M.margin + (buttonW * 2) + (gap * 2)]
  const button = (index: number): TransportButtonGeometry => {
    const rect = { x: xs[index], y: buttonY, w: widths[index], h: buttonH }
    return {
      rect,
      label: field(rect.x + 2, rect.y + Math.floor((rect.h - bodyH) / 2), rect.w - 4, M.bodyScale, 'center'),
    }
  }
  return {
    title: field(M.margin, titleY, inner, M.headingScale, 'center'),
    pattern: field(M.margin, patternY, inner, M.bodyScale, 'center'),
    previous: button(0), playPause: button(1), next: button(2),
    volumeLabel: field(M.margin, volumeY + 1, volumeLabelW, M.bodyScale, 'left'),
    volume: { x: volumeX, y: volumeY, w: width - M.margin - volumeX, h: M.barHeight },
  }
}

function drawTransportButton(
  surface: TftSurface,
  button: TransportButtonGeometry,
  label: string,
  active = false,
): void {
  const c = TRANSPORT_COLORS
  fillTftRect(surface, button.rect.x, button.rect.y, button.rect.w, button.rect.h, active ? c.accent : c.track)
  drawTftRect(surface, button.rect.x, button.rect.y, button.rect.w, button.rect.h, active ? c.text : c.outline)
  drawTftField(surface, button.label, label, active ? c.background : c.text, active ? c.accent : c.track)
}

export function drawTransportFixed(surface: TftSurface, data: TransportFixedData): void {
  const g = fixedTransportGeometry(surface.width, surface.height)
  const c = TRANSPORT_COLORS
  drawTftField(surface, g.title, displayString(data.title), c.text, c.background)
  drawTftField(surface, g.pattern, displayString(data.patternName), c.accent, c.background)
  drawTransportButton(surface, g.previous, 'PREV')
  drawTransportButton(surface, g.playPause, data.playing ? 'PAUSE' : 'PLAY', data.playing)
  drawTransportButton(surface, g.next, 'NEXT')
  drawTftField(surface, g.volumeLabel, VOLUME_LABEL, c.dim, c.background)
  drawTftBar(surface, g.volume, data.volume, c.text, c.track, c.outline)
}

// ── Show Status ─────────────────────────────────────────────────────────────

/**
 * What a Slideshow knows, and nothing else.
 *
 * This layout used to carry section, BPM, beat, output state and brightness
 * as well. None of those has a source: `PatternSlideshow` has no tempo or
 * section concept at all, and the two output readings belong to the LED
 * output rather than to the show. They only ever resolved in a normal sketch,
 * wired from arbitrary graph nodes — which is the custom-UI capability, and
 * it moves there wholesale rather than surviving as five fields that a
 * template build reports unresolved. Exactly what simple-displays.md did to
 * the OLED's `Status` layout, for the same reason.
 *
 * What is left is `PatternSelectValue` drawn large: which pattern is running,
 * where it sits in the collection, and — while the user is browsing away from
 * it — which one they are looking at.
 */
export interface TransportShowStatusData {
  patternName: string
  /** 0-based, the way `patternSelection.ts` counts. The panel shows it 1-based. */
  patternIndex: number
  patternCount: number
  /** The pattern being looked at, which is only meaningful while browsing. */
  highlightName: string
  highlightIndex: number
  browsing: boolean
}

export interface ShowStatusGeometry {
  pattern: TftField
  ordinal: TftField
  status: TftField
  /** Blank rather than absent when not browsing, so the region clears itself. */
  highlight: TftField
  highlightOrdinal: TftField
}

const STATUS_PLAYING = 'PLAYING'
const STATUS_BROWSING = 'BROWSING'

/**
 * Resolve the Show Status layout for a panel of this size.
 *
 * Read top to bottom it answers, in order: what is running, where in the show
 * it is, how fast, and what the lights are actually doing. The output row is
 * near the bottom on purpose — it is the one line that says whether anything
 * is lit at all, and it needs to be findable without reading the rest.
 */
export function showStatusGeometry(width: number, height: number): ShowStatusGeometry {
  const inner = width - (M.margin * 2)
  const bodyH = tftTextHeight(M.bodyScale)
  const headingH = tftTextHeight(M.headingScale)

  // The running pattern owns the top of the glass, because it is the one
  // reading that is true whether or not anyone is touching the panel.
  const patternY = M.margin
  const ordinalY = patternY + headingH + M.rowGap
  const statusY = ordinalY + bodyH + M.rowGap

  // The browsing block sits at the bottom rather than under the status row, so
  // the running pattern's position on the glass never moves when a browse
  // starts or ends. A layout that reflowed on every encoder detent would be
  // unreadable exactly when it is being used.
  const highlightOrdinalY = height - M.margin - bodyH
  const highlightY = highlightOrdinalY - M.rowGap - headingH

  return {
    pattern: field(M.margin, patternY, inner, M.headingScale, 'left'),
    ordinal: field(M.margin, ordinalY, inner, M.bodyScale, 'left'),
    status: field(M.margin, statusY, inner, M.bodyScale, 'left'),
    highlight: field(M.margin, highlightY, inner, M.headingScale, 'left'),
    highlightOrdinal: field(M.margin, highlightOrdinalY, inner, M.bodyScale, 'left'),
  }
}

/**
 * The pattern's position as the panel states it.
 *
 * 1-based for a reader, and it refuses rather than guessing when there is no
 * collection: a lone "1/0" on a panel is worse than being told the wire is not
 * carrying a show.
 */
export function showStatusOrdinalText(index: number, count: number): string {
  const total = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0
  if (total <= 0) return 'NO PATTERNS'
  const at = Number.isFinite(index) ? Math.max(0, Math.floor(index)) : 0
  return `${Math.min(at, total - 1) + 1}/${total}`
}

/**
 * Whether the panel is reporting the show or a browse in progress.
 *
 * Silent when there is no collection, for the same reason
 * `showStatusOrdinalText` refuses to write "1/0": the row above has just said
 * NO PATTERNS, and a panel that follows that with PLAYING is claiming to be
 * running something it has also just said it does not have. The OLED Pattern
 * Browser already draws nothing in that case; this is the colour panel
 * catching up.
 */
export function showStatusStateText(browsing: boolean, count: number): string {
  const total = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0
  if (total <= 0) return ''
  return browsing ? STATUS_BROWSING : STATUS_PLAYING
}

/** Show Status: which pattern is running, and which one is being looked at. */
export function drawTransportShowStatus(surface: TftSurface, data: TransportShowStatusData): void {
  const g = showStatusGeometry(surface.width, surface.height)
  const c = TRANSPORT_COLORS

  drawTftField(surface, g.pattern, displayString(data.patternName), c.text, c.background)
  drawTftField(surface, g.ordinal, showStatusOrdinalText(data.patternIndex, data.patternCount), c.dim, c.background)
  drawTftField(
    surface, g.status, showStatusStateText(data.browsing, data.patternCount),
    data.browsing ? c.accent : c.dim, c.background,
  )

  // Blank rather than skipped: painting the empty fields is what clears the
  // previous candidate off the glass when a browse ends, and the firmware
  // caches per field, so an unchanged blank costs nothing after the first.
  drawTftField(
    surface, g.highlight,
    data.browsing ? displayString(data.highlightName) : '',
    c.accent, c.background,
  )
  drawTftField(
    surface, g.highlightOrdinal,
    data.browsing ? showStatusOrdinalText(data.highlightIndex, data.patternCount) : '',
    c.dim, c.background,
  )
}

// ── Diagnostics ─────────────────────────────────────────────────────────────────────────────

export interface TransportDiagnosticsData {
  touchAvailable: boolean
  pressed: boolean
  x: number
  y: number
  /** Raw ADC values exist only on the physical XPT2046 diagnostic path. */
  rawX?: number
  rawY?: number
}

export interface DiagnosticsGeometry {
  title: TftField
  panel: TftField
  touch: TftField
  coordinates: TftField
  rawCoordinates: TftField
  swatches: TftRect[]
}

export function diagnosticsGeometry(width: number, height: number): DiagnosticsGeometry {
  const inner = width - (M.margin * 2)
  const headingH = tftTextHeight(M.headingScale)
  const bodyH = tftTextHeight(M.bodyScale)
  const swatchGap = M.rowGap
  const swatchW = Math.floor((inner - (swatchGap * 3)) / 4)
  const swatchY = M.margin + headingH + (M.rowGap * 2)
  const swatchH = Math.max(28, Math.floor(height * 0.2))
  const touchY = swatchY + swatchH + (M.rowGap * 2)
  return {
    title: field(M.margin, M.margin, inner, M.headingScale, 'center'),
    panel: field(M.margin, touchY, inner, M.bodyScale, 'center'),
    touch: field(M.margin, touchY + bodyH + M.rowGap, inner, M.headingScale, 'center'),
    coordinates: field(M.margin, touchY + bodyH + M.rowGap + headingH + M.rowGap, inner, M.bodyScale, 'center'),
    rawCoordinates: field(M.margin, touchY + bodyH + M.rowGap + headingH + (M.rowGap * 2) + bodyH, inner, M.bodyScale, 'center'),
    swatches: Array.from({ length: 4 }, (_, i) => ({
      x: M.margin + (i * (swatchW + swatchGap)), y: swatchY, w: swatchW, h: swatchH,
    })),
  }
}

export function diagnosticsTouchText(data: TransportDiagnosticsData): string {
  if (!data.touchAvailable) return 'NO TOUCH'
  return data.pressed ? 'TOUCH DOWN' : 'TOUCH READY'
}

export function diagnosticsCoordinateText(data: TransportDiagnosticsData): string {
  return data.touchAvailable && data.pressed
    ? `X ${Math.round(data.x)}  Y ${Math.round(data.y)}`
    : 'PRESS THE PANEL'
}

export function diagnosticsRawCoordinateText(data: TransportDiagnosticsData): string {
  if (!data.touchAvailable) return 'NO RAW INPUT'
  if (!data.pressed) return 'RAW --  --'
  if (data.rawX == null || data.rawY == null) return 'RAW DEVICE ONLY'
  return `RAW ${Math.round(data.rawX)}  ${Math.round(data.rawY)}`
}

export function drawTransportDiagnostics(surface: TftSurface, data: TransportDiagnosticsData): void {
  const g = diagnosticsGeometry(surface.width, surface.height)
  const c = TRANSPORT_COLORS
  const swatches = [rgb565(255, 0, 0), rgb565(0, 255, 0), rgb565(0, 96, 255), rgb565(255, 255, 255)]
  drawTftField(surface, g.title, 'DISPLAY TEST', c.text, c.background)
  g.swatches.forEach((rect, i) => {
    fillTftRect(surface, rect.x, rect.y, rect.w, rect.h, swatches[i])
    drawTftRect(surface, rect.x, rect.y, rect.w, rect.h, c.outline)
  })
  drawTftField(surface, g.panel, `${surface.width} X ${surface.height}`, c.dim, c.background)
  drawTftField(surface, g.touch, diagnosticsTouchText(data), data.pressed ? c.on : c.accent, c.background)
  drawTftField(surface, g.coordinates, diagnosticsCoordinateText(data), c.text, c.background)
  drawTftField(surface, g.rawCoordinates, diagnosticsRawCoordinateText(data), c.dim, c.background)
}

// ── Clock ────────────────────────────────────────────────────────────────

/**
 * An RTC's own reading, drawn large.
 *
 * The colour twin of `InfoDisplay`'s Clock layout, but the extra room and a
 * third channel — colour — buy two things the 1-bit panel cannot afford: the
 * hour reads with seconds, since a static HH:MM on a screen this size looks
 * stopped rather than merely quiet, and the sync state is a colour
 * (green/amber/red) rather than only a word, legible from further away than
 * text alone.
 */
export interface TransportClockData {
  timeText: string
  dateText: string
  valid: boolean
  synced: boolean
  stale: boolean
}

export interface ClockGeometry {
  time: TftField
  date: TftField
  status: TftField
}

/**
 * Centred as a block, the same reasoning as `transportWaitingGeometry`: a
 * clock face pinned to a corner of a 240-pixel panel reads as a rendering
 * fault, not as a clock.
 */
export function transportClockGeometry(width: number, height: number): ClockGeometry {
  const inner = width - (M.margin * 2)
  const timeH = tftTextHeight(M.headingScale)
  const dateH = tftTextHeight(M.bodyScale)
  const statusH = tftTextHeight(M.bodyScale)
  const blockH = timeH + M.rowGap + dateH + M.rowGap + statusH
  const top = Math.max(M.margin, Math.floor((height - blockH) / 2))
  return {
    time: field(M.margin, top, inner, M.headingScale, 'center'),
    date: field(M.margin, top + timeH + M.rowGap, inner, M.bodyScale, 'center'),
    status: field(M.margin, top + timeH + M.rowGap + dateH + M.rowGap, inner, M.bodyScale, 'center'),
  }
}

function clockStatusColor(data: TransportClockData): number {
  const c = TRANSPORT_COLORS
  if (!data.valid) return c.off
  return data.synced && !data.stale ? c.on : c.accent
}

/** Three states an RTC can report, distinct from the OLED's two: a stale sync counts as not synced. */
export function clockStatusText(data: TransportClockData): string {
  if (!data.valid) return 'NO CLOCK'
  return data.synced && !data.stale ? 'SYNCED' : 'NOT SYNCED'
}

export function drawTransportClock(surface: TftSurface, data: TransportClockData): void {
  const g = transportClockGeometry(surface.width, surface.height)
  const c = TRANSPORT_COLORS
  drawTftField(surface, g.time, data.timeText, c.text, c.background)
  drawTftField(surface, g.date, data.dateText, c.dim, c.background)
  drawTftField(surface, g.status, clockStatusText(data), clockStatusColor(data), c.background)
}

// ── Rendering ───────────────────────────────────────────────────────────────

export type TransportDisplayData =
  | { layout: 'Waiting' }
  | { layout: 'Clock'; data: TransportClockData }
  | { layout: 'Now Playing'; data: TransportNowPlayingData }
  | { layout: 'Fixed Transport'; data: TransportFixedData }
  | { layout: 'Show Status'; data: TransportShowStatusData }
  | { layout: 'Diagnostics'; data: TransportDiagnosticsData }

/** Render any layout onto a fresh surface for `controller` mounted at `rotation`. */
export function renderTransportDisplay(
  controller: TftController,
  rotation: TftRotation,
  input: TransportDisplayData,
): TftSurface {
  const surface = createTftSurfaceFor(controller, rotation)
  clearTftSurface(surface, TRANSPORT_COLORS.background)
  switch (input.layout) {
    case 'Waiting': drawTransportWaiting(surface); break
    case 'Clock': drawTransportClock(surface, input.data); break
    case 'Now Playing': drawTransportNowPlaying(surface, input.data); break
    case 'Fixed Transport': drawTransportFixed(surface, input.data); break
    case 'Show Status': drawTransportShowStatus(surface, input.data); break
    case 'Diagnostics': drawTransportDiagnostics(surface, input.data); break
  }
  return surface
}

/**
 * Blank data per layout, for a dark panel.
 *
 * A panel with nothing plugged in is not this: it draws `Waiting`, because a
 * blank screen and a broken screen are indistinguishable. This is what a
 * layout renders when it is disabled or has no reading yet.
 */
export function blankTransportData(layout: TransportDisplayLayout): TransportDisplayData {
  if (layout === 'Waiting') return { layout }
  if (layout === 'Clock') {
    return { layout, data: { timeText: '--:--:--', dateText: '', valid: false, synced: false, stale: true } }
  }
  if (layout === 'Fixed Transport') {
    return { layout, data: { title: '', patternName: '', playing: false, volume: 0 } }
  }
  if (layout === 'Show Status') {
    return {
      layout,
      data: {
        patternName: '', patternIndex: 0, patternCount: 0,
        highlightName: '', highlightIndex: 0, browsing: false,
      },
    }
  }
  if (layout === 'Diagnostics') {
    return { layout, data: { touchAvailable: false, pressed: false, x: 0, y: 0 } }
  }
  return {
    layout: 'Now Playing',
    data: {
      title: '', artist: '', elapsedSec: 0, durationSec: 0, progress: 0,
      playing: false, volume: 0, patternName: '', artwork: null,
    },
  }
}
