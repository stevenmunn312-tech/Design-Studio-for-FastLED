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
  createTftSurfaceFor, clearTftSurface, drawTftField, drawTftBar, drawTftIndicator,
  drawTftArtwork, drawTftRect, fillTftRect, rgb565, tftTextHeight, tftTextWidth,
  type TftController, type TftField, type TftRect, type TftRotation, type TftSurface,
} from './tftSurface'
import { formatTransportTime } from './transportBridge'
import { DISPLAY_TEXT_NO_READING, displayString } from './displayText'

export const TRANSPORT_DISPLAY_LAYOUTS = ['Now Playing', 'Fixed Transport', 'Show Status'] as const
export type TransportDisplayLayout = (typeof TRANSPORT_DISPLAY_LAYOUTS)[number]

export function asTransportDisplayLayout(value: unknown): TransportDisplayLayout {
  const layout = String(value ?? '')
  return (TRANSPORT_DISPLAY_LAYOUTS as readonly string[]).includes(layout)
    ? (layout as TransportDisplayLayout)
    : 'Now Playing'
}

// ── Shared metrics ──────────────────────────────────────────────────────────

/**
 * The pixel vocabulary both layouts are built from.
 *
 * Text scales are integer repeats of the shared 3x5 font: 2 is a readable
 * body row at arm's length on a 240-pixel panel, 3 is a heading, and 5 is the
 * BPM readout you can see from the desk. Anything finer would need a second
 * font in flash and a second glyph table to keep in step with the LED matrix.
 */
export const TRANSPORT_METRICS = {
  margin: 8,
  /** Vertical gap between stacked rows. */
  rowGap: 6,
  bodyScale: 2,
  headingScale: 3,
  bigScale: 5,
  barHeight: 12,
  /** Space between the artwork and the text under it. */
  artGap: 12,
  /** Edge of a beat marker, and the gap between two of them. */
  beatSize: 16,
  beatGap: 8,
} as const

/**
 * Beats a bar is divided into on the Show Status panel.
 *
 * Four, because the show's section/beat model counts a bar of four and a
 * panel that drew a variable number of markers would move its own layout
 * every time the meter changed.
 */
export const TRANSPORT_BEAT_COUNT = 4

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

export interface TransportShowStatusData {
  patternName: string
  /** 0-based, the way `patternSelection.ts` counts. The panel shows it 1-based. */
  patternIndex: number
  patternCount: number
  section: string
  bpm: number
  /** Beat within the bar; fractional values are floored to the marker they are on. */
  beat: number
  outputEnabled: boolean
  /** 0-1. */
  brightness: number
}

export interface ShowStatusGeometry {
  pattern: TftField
  ordinal: TftField
  section: TftField
  bpm: TftField
  bpmLabel: TftField
  beats: TftRect
  beatSize: number
  beatGap: number
  beatCount: number
  output: TftField
  brightnessLabel: TftField
  brightness: TftRect
}

const BPM_LABEL = 'BPM'
const BRIGHTNESS_LABEL = 'BRIGHT'
/** Widest reading the big field has to hold, so the layout is size-stable. */
const BPM_WIDEST = '000'

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
  const bigH = tftTextHeight(M.bigScale)

  const patternY = M.margin
  const ordinalY = patternY + headingH + M.rowGap
  const sectionY = ordinalY + bodyH + M.rowGap
  const topEnd = sectionY + bodyH

  const brightnessY = height - M.margin - M.barHeight
  const outputY = brightnessY - M.rowGap - headingH
  const beatsY = outputY - (M.rowGap * 2) - M.beatSize

  // The tempo block takes the middle, centred in whatever the two stacks left.
  const bpmY = topEnd + Math.max(0, Math.floor((beatsY - topEnd - bigH) / 2))
  const bpmW = tftTextWidth(BPM_WIDEST, M.bigScale)
  const bpmLabelW = tftTextWidth(BPM_LABEL, M.bodyScale)

  const brightnessLabelW = tftTextWidth(BRIGHTNESS_LABEL, M.bodyScale)
  const brightnessX = M.margin + brightnessLabelW + M.rowGap

  const beatsW = (TRANSPORT_BEAT_COUNT * M.beatSize) + ((TRANSPORT_BEAT_COUNT - 1) * M.beatGap)

  return {
    pattern: field(M.margin, patternY, inner, M.headingScale, 'left'),
    ordinal: field(M.margin, ordinalY, inner, M.bodyScale, 'left'),
    section: field(M.margin, sectionY, inner, M.bodyScale, 'left'),
    bpm: field(M.margin, bpmY, bpmW, M.bigScale, 'right'),
    // Sat on the big number's baseline rather than its top, so the unit reads
    // as attached to the figure instead of floating above it.
    bpmLabel: field(M.margin + bpmW + M.rowGap, bpmY + bigH - bodyH, bpmLabelW, M.bodyScale, 'left'),
    beats: { x: M.margin, y: beatsY, w: beatsW, h: M.beatSize },
    beatSize: M.beatSize,
    beatGap: M.beatGap,
    beatCount: TRANSPORT_BEAT_COUNT,
    output: field(M.margin, outputY, inner, M.headingScale, 'left'),
    brightnessLabel: field(M.margin, brightnessY + 1, brightnessLabelW, M.bodyScale, 'left'),
    brightness: { x: brightnessX, y: brightnessY, w: width - M.margin - brightnessX, h: M.barHeight },
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
 * BPM as an integer, or the shared no-reading marker.
 *
 * Dashes rather than 0, because a show with no tempo and a show stopped dead
 * are different things and only one of them is a fault.
 */
export function showStatusBpmText(bpm: number): string {
  if (!Number.isFinite(bpm) || bpm <= 0) return DISPLAY_TEXT_NO_READING
  return String(Math.round(bpm))
}

/** Which of the four markers is lit for this beat position. */
export function showStatusBeatIndex(beat: number): number {
  if (!Number.isFinite(beat)) return 0
  const floored = Math.floor(beat)
  return ((floored % TRANSPORT_BEAT_COUNT) + TRANSPORT_BEAT_COUNT) % TRANSPORT_BEAT_COUNT
}

/** Whether the lights are on, as a phrase rather than a symbol. */
export function showStatusOutputText(enabled: boolean): string {
  return enabled ? 'OUTPUT ON' : 'OUTPUT OFF'
}

/** Show Status: pattern, section, tempo, and what the lights are doing. */
export function drawTransportShowStatus(surface: TftSurface, data: TransportShowStatusData): void {
  const g = showStatusGeometry(surface.width, surface.height)
  const c = TRANSPORT_COLORS

  drawTftField(surface, g.pattern, displayString(data.patternName), c.text, c.background)
  drawTftField(surface, g.ordinal, showStatusOrdinalText(data.patternIndex, data.patternCount), c.dim, c.background)
  drawTftField(surface, g.section, displayString(data.section), c.accent, c.background)

  drawTftField(surface, g.bpm, showStatusBpmText(data.bpm), c.text, c.background)
  drawTftField(surface, g.bpmLabel, BPM_LABEL, c.dim, c.background)

  const lit = showStatusBeatIndex(data.beat)
  for (let i = 0; i < g.beatCount; i++) {
    drawTftIndicator(
      surface,
      g.beats.x + (i * (g.beatSize + g.beatGap)),
      g.beats.y,
      g.beatSize,
      i === lit,
      c.accent,
      c.outline,
    )
  }

  drawTftField(
    surface, g.output, showStatusOutputText(data.outputEnabled),
    data.outputEnabled ? c.on : c.off, c.background,
  )
  drawTftField(surface, g.brightnessLabel, BRIGHTNESS_LABEL, c.dim, c.background)
  drawTftBar(surface, g.brightness, data.brightness, c.text, c.track, c.outline)
}

// ── Rendering ───────────────────────────────────────────────────────────────

export type TransportDisplayData =
  | { layout: 'Now Playing'; data: TransportNowPlayingData }
  | { layout: 'Fixed Transport'; data: TransportFixedData }
  | { layout: 'Show Status'; data: TransportShowStatusData }

/** Render any layout onto a fresh surface for `controller` mounted at `rotation`. */
export function renderTransportDisplay(
  controller: TftController,
  rotation: TftRotation,
  input: TransportDisplayData,
): TftSurface {
  const surface = createTftSurfaceFor(controller, rotation)
  clearTftSurface(surface, TRANSPORT_COLORS.background)
  switch (input.layout) {
    case 'Now Playing': drawTransportNowPlaying(surface, input.data); break
    case 'Fixed Transport': drawTransportFixed(surface, input.data); break
    case 'Show Status': drawTransportShowStatus(surface, input.data); break
  }
  return surface
}

/** Blank data per layout, for an unwired node or a dark panel. */
export function blankTransportData(layout: TransportDisplayLayout): TransportDisplayData {
  if (layout === 'Fixed Transport') {
    return { layout, data: { title: '', patternName: '', playing: false, volume: 0 } }
  }
  if (layout === 'Show Status') {
    return {
      layout,
      data: {
        patternName: '', patternIndex: 0, patternCount: 0, section: '',
        bpm: 0, beat: 0, outputEnabled: false, brightness: 0,
      },
    }
  }
  return {
    layout: 'Now Playing',
    data: {
      title: '', artist: '', elapsedSec: 0, durationSec: 0, progress: 0,
      playing: false, volume: 0, patternName: '', artwork: null,
    },
  }
}
