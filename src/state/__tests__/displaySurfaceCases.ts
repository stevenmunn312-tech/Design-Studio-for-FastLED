/**
 * Every picture the fixed display layouts can draw, enumerated once.
 *
 * The visual half of HW-08. Two consumers read this module and they have to
 * be looking at the same set or neither is worth much:
 * `displaySurfaceGolden.test.ts` freezes each case against a recorded digest,
 * and `scripts/generate-display-sheets.mjs` rasterises the same cases into
 * contact sheets a person can actually look at. Keeping the enumeration in
 * one module rather than restating it in each is the same reasoning that put
 * `stereoVuGoldenVectors.ts` beside its test: a comparison between two
 * harnesses answering slightly different questions proves nothing.
 *
 * The geometry is *derived*, never listed — controllers crossed with their
 * rotations, deduplicated by the size that falls out, because two rotations
 * producing the same surface produce byte-identical pixels and a second copy
 * would only dilute the sheet. So a new controller or a new rotation enters
 * the set on its own, and a new layout added to `TRANSPORT_DISPLAY_LAYOUTS`
 * or `INFO_DISPLAY_LAYOUTS` fails to type-check here until someone has said
 * what it should be pictured doing.
 *
 * Every layout that carries data is pictured at rest as well as live, because
 * at rest is a real reading: a disabled panel and a panel with nothing to say
 * both draw it, and it is the state least likely to be looked at by hand.
 */
import {
  INFO_DISPLAY_LAYOUTS, blankInfoData, renderInfoDisplay,
  type InfoDisplayData, type InfoDisplayLayout,
} from '../infoDisplay'
import { OLED_CONTROLLERS, getPixel, type OledController, type OledSurface } from '../oledSurface'
import { THUMBNAIL_BYTES, THUMBNAIL_H, THUMBNAIL_W, type PatternThumbnail } from '../patternThumbnail'
import {
  TFT_CONTROLLERS, TFT_ROTATIONS, rgb565, rgb565Components, tftRotatedSize,
  type TftController, type TftRotation, type TftSurface,
} from '../tftSurface'
import {
  TRANSPORT_ARTWORK_H, TRANSPORT_ARTWORK_W, TRANSPORT_DISPLAY_LAYOUTS,
  blankTransportData, renderTransportDisplay,
  type TransportDisplayData, type TransportDisplayLayout,
} from '../transportDisplay'

/** A drawn panel, normalised out of its native format into plain RGB. */
export interface RenderedSurface {
  width: number
  height: number
  /** One `0xRRGGBB` per pixel, row-major. */
  rgb: Uint32Array
}

export interface DisplaySurfaceCase {
  /** Stable key into the recorded digests. */
  id: string
  family: 'tft' | 'oled'
  layout: string
  /** Which reading of that layout — `at-rest` is the disabled/no-data one. */
  state: string
  width: number
  height: number
  render: () => RenderedSurface
}

// ── Fixtures ────────────────────────────────────────────────────────────────
// Synthetic and deterministic. Real baked artwork would drag the pattern
// evaluator into a test about drawing, and a recorded digest has to be
// reproducible on a machine that has never opened a workspace.

/** A 96x96 RGB565 gradient standing in for baked cover art. */
function fixtureArtwork(): Uint8Array {
  const bytes = new Uint8Array(TRANSPORT_ARTWORK_W * TRANSPORT_ARTWORK_H * 2)
  for (let y = 0; y < TRANSPORT_ARTWORK_H; y += 1) {
    for (let x = 0; x < TRANSPORT_ARTWORK_W; x += 1) {
      const value = rgb565(
        (x * 255 / (TRANSPORT_ARTWORK_W - 1)) | 0,
        (y * 255 / (TRANSPORT_ARTWORK_H - 1)) | 0,
        ((x + y) * 127 / (TRANSPORT_ARTWORK_W + TRANSPORT_ARTWORK_H - 2)) | 0,
      )
      const i = (y * TRANSPORT_ARTWORK_W + x) * 2
      bytes[i] = (value >> 8) & 0xff
      bytes[i + 1] = value & 0xff
    }
  }
  return bytes
}

/** A 32x32 page-major 1-bit thumbnail — a ring, so an axis flip would show. */
function fixtureThumbnail(): PatternThumbnail {
  const data = new Uint8Array(THUMBNAIL_BYTES)
  const cx = (THUMBNAIL_W - 1) / 2
  const cy = (THUMBNAIL_H - 1) / 2
  for (let y = 0; y < THUMBNAIL_H; y += 1) {
    for (let x = 0; x < THUMBNAIL_W; x += 1) {
      const radius = Math.hypot(x - cx, y - cy)
      if (radius < 9 || radius > 13) continue
      data[(y >> 3) * THUMBNAIL_W + x] |= 1 << (y & 7)
    }
  }
  return { width: THUMBNAIL_W, height: THUMBNAIL_H, data }
}

const ARTWORK = fixtureArtwork()
const THUMBNAIL = fixtureThumbnail()

const TRACK_TITLE = 'Nightdrive Over the Estuary'
const TRACK_ARTIST = 'The Long Meridian'

// ── The readings each layout is pictured in ─────────────────────────────────
// A `Record` keyed on the layout union rather than a list, so adding a layout
// is a compile error here until someone decides what it should be shown doing.

const TFT_STATES: Record<TransportDisplayLayout, Record<string, TransportDisplayData>> = {
  'Waiting': {
    'unwired': { layout: 'Waiting' },
  },
  'Clock': {
    'synced': { layout: 'Clock', data: { timeText: '21:47:05', dateText: 'WED 10 SEP', valid: true, synced: true, stale: false } },
    'free-running': { layout: 'Clock', data: { timeText: '21:47:05', dateText: 'WED 10 SEP', valid: true, synced: false, stale: false } },
    // Two readings are deliberately absent rather than forgotten. A *stale*
    // sync draws NOT SYNCED, the same face as a clock that never synced, and
    // `clockStatusText` is where that rule is stated and held; and a panel
    // with no clock at all is already the at-rest reading below, which
    // `blankTransportData` supplies. Recording either would be a duplicate
    // digest counted as coverage.
  },
  'Now Playing': {
    'playing': { layout: 'Now Playing', data: {
      title: TRACK_TITLE, artist: TRACK_ARTIST,
      elapsedSec: 97, durationSec: 254, progress: 97 / 254, playing: true,
      volume: 0.72, patternName: 'Aurora Drift', artwork: ARTWORK,
    } },
    'paused': { layout: 'Now Playing', data: {
      title: TRACK_TITLE, artist: TRACK_ARTIST,
      elapsedSec: 97, durationSec: 254, progress: 97 / 254, playing: false,
      volume: 0.72, patternName: 'Aurora Drift', artwork: ARTWORK,
    } },
    // A track with no baked picture draws an empty frame, which has to stay
    // distinguishable from art that happens to be black.
    'no-artwork': { layout: 'Now Playing', data: {
      title: TRACK_TITLE, artist: TRACK_ARTIST,
      elapsedSec: 97, durationSec: 254, progress: 97 / 254, playing: true,
      volume: 0.72, patternName: 'Aurora Drift', artwork: null,
    } },
  },
  'Fixed Transport': {
    'playing': { layout: 'Fixed Transport', data: { title: TRACK_TITLE, patternName: 'Aurora Drift', playing: true, volume: 0.72 } },
    'paused': { layout: 'Fixed Transport', data: { title: TRACK_TITLE, patternName: 'Aurora Drift', playing: false, volume: 0.72 } },
    'muted': { layout: 'Fixed Transport', data: { title: TRACK_TITLE, patternName: 'Aurora Drift', playing: true, volume: 0 } },
  },
  'Show Status': {
    'running': { layout: 'Show Status', data: { patternName: 'Aurora Drift', patternIndex: 2, patternCount: 9, highlightName: 'Aurora Drift', highlightIndex: 2, browsing: false } },
    'browsing': { layout: 'Show Status', data: { patternName: 'Aurora Drift', patternIndex: 2, patternCount: 9, highlightName: 'Ember Cascade', highlightIndex: 5, browsing: true } },
  },
  'Diagnostics': {
    'untouched': { layout: 'Diagnostics', data: { touchAvailable: true, pressed: false, x: 0, y: 0 } },
    'pressed': { layout: 'Diagnostics', data: { touchAvailable: true, pressed: true, x: 148, y: 92, rawX: 1832, rawY: 2410 } },
    // A panel with no touch fitted is the at-rest reading below, which
    // `blankTransportData` already supplies — not a case of its own.
  },
}

const OLED_STATES: Record<InfoDisplayLayout, Record<string, InfoDisplayData>> = {
  'Waiting': {
    'unwired': { layout: 'Waiting' },
  },
  'Clock': {
    'synced': { layout: 'Clock', data: { timeText: '21:47', dateText: 'WED 10 SEP', valid: true, synced: true } },
    'free-running': { layout: 'Clock', data: { timeText: '21:47', dateText: 'WED 10 SEP', valid: true, synced: false } },
  },
  'Now Playing': {
    'playing': { layout: 'Now Playing', data: { title: TRACK_TITLE, elapsedSec: 97, durationSec: 254, progress: 97 / 254, playing: true, volume: 0.72 } },
    'paused': { layout: 'Now Playing', data: { title: TRACK_TITLE, elapsedSec: 97, durationSec: 254, progress: 97 / 254, playing: false, volume: 0.72 } },
  },
  'Pattern Browser': {
    'playing': { layout: 'Pattern Browser', data: { name: 'Aurora Drift', ordinal: 3, count: 9, thumbnail: THUMBNAIL, browsing: false, activeName: 'Aurora Drift' } },
    'browsing': { layout: 'Pattern Browser', data: { name: 'Ember Cascade', ordinal: 6, count: 9, thumbnail: THUMBNAIL, browsing: true, activeName: 'Aurora Drift' } },
    // A collection over its flash budget keeps its names and loses its
    // pictures; that has to read as a missing picture, not as no patterns.
    'no-thumbnail': { layout: 'Pattern Browser', data: { name: 'Ember Cascade', ordinal: 6, count: 9, thumbnail: null, browsing: true, activeName: 'Aurora Drift' } },
  },
}

// ── Geometry ────────────────────────────────────────────────────────────────

export interface TftGeometry {
  key: string
  controller: TftController
  rotation: TftRotation
  width: number
  height: number
}

/** Each distinct surface a catalogued colour panel can present, once. */
export function tftGeometries(): TftGeometry[] {
  const seen = new Map<string, TftGeometry>()
  for (const controller of Object.values(TFT_CONTROLLERS)) {
    for (const rotation of TFT_ROTATIONS) {
      const { width, height } = tftRotatedSize(controller, rotation)
      const key = `${width}x${height}`
      if (!seen.has(key)) seen.set(key, { key, controller, rotation, width, height })
    }
  }
  return [...seen.values()].sort((a, b) => a.key.localeCompare(b.key))
}

export interface OledGeometry {
  key: string
  controller: OledController
  width: number
  height: number
}

/** Each distinct monochrome surface, once. Rotation on these panels is a
 *  scan-order command rather than a different picture, so it is not a case. */
export function oledGeometries(): OledGeometry[] {
  const seen = new Map<string, OledGeometry>()
  for (const controller of Object.values(OLED_CONTROLLERS)) {
    const key = `${controller.width}x${controller.height}`
    if (!seen.has(key)) seen.set(key, { key, controller, width: controller.width, height: controller.height })
  }
  return [...seen.values()].sort((a, b) => a.key.localeCompare(b.key))
}

// ── Normalisation ───────────────────────────────────────────────────────────

function fromTft(surface: TftSurface): RenderedSurface {
  const rgb = new Uint32Array(surface.width * surface.height)
  for (let i = 0; i < rgb.length; i += 1) {
    const { r, g, b } = rgb565Components(surface.data[i])
    rgb[i] = (r << 16) | (g << 8) | b
  }
  return { width: surface.width, height: surface.height, rgb }
}

function fromOled(surface: OledSurface): RenderedSurface {
  const rgb = new Uint32Array(surface.width * surface.height)
  for (let y = 0; y < surface.height; y += 1) {
    for (let x = 0; x < surface.width; x += 1) {
      rgb[y * surface.width + x] = getPixel(surface, x, y) ? 0xffffff : 0x000000
    }
  }
  return { width: surface.width, height: surface.height, rgb }
}

// ── The set ─────────────────────────────────────────────────────────────────

export function displaySurfaceCases(): DisplaySurfaceCase[] {
  const cases: DisplaySurfaceCase[] = []

  for (const geometry of tftGeometries()) {
    for (const layout of TRANSPORT_DISPLAY_LAYOUTS) {
      const rest = blankTransportData(layout)
      // Only where at rest is a different picture: `Waiting` carries no data,
      // so its at-rest reading is the reading.
      const states: Array<[string, TransportDisplayData]> = 'data' in rest
        ? [...Object.entries(TFT_STATES[layout]), ['at-rest', rest] as [string, TransportDisplayData]]
        : Object.entries(TFT_STATES[layout])
      for (const [state, data] of states) {
        cases.push({
          id: `tft/${geometry.key}/${layout}/${state}`,
          family: 'tft', layout, state, width: geometry.width, height: geometry.height,
          render: () => fromTft(renderTransportDisplay(geometry.controller, geometry.rotation, data)),
        })
      }
    }
  }

  for (const geometry of oledGeometries()) {
    for (const layout of INFO_DISPLAY_LAYOUTS) {
      const rest = blankInfoData(layout)
      const states: Array<[string, InfoDisplayData]> = 'data' in rest
        ? [...Object.entries(OLED_STATES[layout]), ['at-rest', rest] as [string, InfoDisplayData]]
        : Object.entries(OLED_STATES[layout])
      for (const [state, data] of states) {
        cases.push({
          id: `oled/${geometry.key}/${layout}/${state}`,
          family: 'oled', layout, state, width: geometry.width, height: geometry.height,
          render: () => fromOled(renderInfoDisplay(geometry.controller, data)),
        })
      }
    }
  }

  return cases
}

// ── Digest ──────────────────────────────────────────────────────────────────

export interface SurfaceProfile {
  width: number
  height: number
  /** Distinct colours drawn. */
  colors: number
  /** Percent of the panel that is not its most common colour, to 2 dp. A
   *  layout that stops drawing then reads as a coverage collapse rather than
   *  as an opaque hash mismatch, which is the whole reason this is recorded
   *  beside the hash rather than the hash being recorded alone. */
  coverage: number
  /** FNV-1a over the pixels, catching everything the two numbers above miss. */
  hash: string
}

export function profileSurface(surface: RenderedSurface): SurfaceProfile {
  const counts = new Map<number, number>()
  for (const pixel of surface.rgb) counts.set(pixel, (counts.get(pixel) ?? 0) + 1)
  let modal = 0
  for (const count of counts.values()) modal = Math.max(modal, count)
  const total = surface.rgb.length
  let hash = 0x811c9dc5
  for (const pixel of surface.rgb) {
    hash = Math.imul(hash ^ (pixel & 0xff), 0x01000193)
    hash = Math.imul(hash ^ ((pixel >>> 8) & 0xff), 0x01000193)
    hash = Math.imul(hash ^ ((pixel >>> 16) & 0xff), 0x01000193)
  }
  return {
    width: surface.width,
    height: surface.height,
    colors: counts.size,
    coverage: Math.round(((total - modal) / total) * 10000) / 100,
    hash: (hash >>> 0).toString(16).padStart(8, '0'),
  }
}
