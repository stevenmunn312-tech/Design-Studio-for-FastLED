// Shared touch geometry for the fixed Transport Display layouts.
//
// Raw XPT2046 readings are calibrated in the panel's native portrait space,
// then rotated into the same mounted coordinate system `TftSurface` uses.
// Hit regions come from the layout geometry itself: the visible control and
// the thing that responds can therefore never drift apart.

import { fixedTransportGeometry, nowPlayingGeometry, type TransportDisplayLayout } from './transportDisplay'
import { tftRotatedSize, type TftController, type TftRect, type TftRotation } from './tftSurface'

export interface TouchCalibration {
  xMin: number
  xMax: number
  yMin: number
  yMax: number
}

export const DEFAULT_XPT2046_CALIBRATION: TouchCalibration = {
  xMin: 200, xMax: 3900, yMin: 200, yMax: 3900,
}

export interface TouchPoint { x: number; y: number }

/** Raw ADC reading from an XPT2046-class digitiser. */
export interface RawTouchPoint { x: number; y: number }

/**
 * The four places a calibration run asks the user to touch.
 *
 * The result only needs the extrema, but naming every mounted corner makes it
 * much harder to calibrate the wrong edge or stop after one diagonal. Rotation
 * does not change the calculation: all four mounted corners still contain both
 * extrema of the controller's native X and Y axes.
 */
export const TOUCH_CALIBRATION_CORNERS = [
  { id: 'topLeft', label: 'top-left corner' },
  { id: 'topRight', label: 'top-right corner' },
  { id: 'bottomRight', label: 'bottom-right corner' },
  { id: 'bottomLeft', label: 'bottom-left corner' },
] as const

export type TouchCalibrationCorner = typeof TOUCH_CALIBRATION_CORNERS[number]['id']
export type TouchCalibrationCapturePhase = 'ready' | 'collecting' | 'captured' | 'complete'

/** A short hold supplies enough readings to reject one noisy ADC sample. */
export const TOUCH_CALIBRATION_SAMPLES_PER_CORNER = 5

export interface TouchCalibrationCapture {
  phase: TouchCalibrationCapturePhase
  cornerIndex: number
  samples: Record<TouchCalibrationCorner, RawTouchPoint[]>
  latest: RawTouchPoint | null
  result: TouchCalibration | null
  error: string | null
}

function emptyCalibrationSamples(): Record<TouchCalibrationCorner, RawTouchPoint[]> {
  return { topLeft: [], topRight: [], bottomRight: [], bottomLeft: [] }
}

export function createTouchCalibrationCapture(): TouchCalibrationCapture {
  return {
    phase: 'ready',
    cornerIndex: 0,
    samples: emptyCalibrationSamples(),
    latest: null,
    result: null,
    error: null,
  }
}

/** Arm the current corner. Serial readings are ignored before this point. */
export function beginTouchCalibrationCorner(capture: TouchCalibrationCapture): TouchCalibrationCapture {
  if (capture.phase !== 'ready' && capture.phase !== 'captured') return capture
  const cornerIndex = capture.phase === 'captured'
    ? Math.min(TOUCH_CALIBRATION_CORNERS.length - 1, capture.cornerIndex + 1)
    : capture.cornerIndex
  const corner = TOUCH_CALIBRATION_CORNERS[cornerIndex].id
  return {
    ...capture,
    phase: 'collecting',
    cornerIndex,
    samples: { ...capture.samples, [corner]: [] },
    latest: null,
    result: null,
    error: null,
  }
}

/** Discard the current corner and immediately arm it again. */
export function retryTouchCalibrationCorner(capture: TouchCalibrationCapture): TouchCalibrationCapture {
  if (capture.phase !== 'captured' && capture.phase !== 'complete') return capture
  const corner = TOUCH_CALIBRATION_CORNERS[capture.cornerIndex].id
  return {
    ...capture,
    phase: 'collecting',
    samples: { ...capture.samples, [corner]: [] },
    latest: null,
    result: null,
    error: null,
  }
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

/** Reduce each held corner to one jitter-resistant point, then take its bounds. */
export function touchCalibrationFromSamples(
  samples: Record<TouchCalibrationCorner, RawTouchPoint[]>,
): TouchCalibration | null {
  const corners = TOUCH_CALIBRATION_CORNERS.map(({ id }) => samples[id])
  if (corners.some((points) => points.length < TOUCH_CALIBRATION_SAMPLES_PER_CORNER)) return null
  const representatives = corners.map((points) => ({
    x: median(points.map((point) => point.x)),
    y: median(points.map((point) => point.y)),
  }))
  const x = representatives.map((point) => point.x)
  const y = representatives.map((point) => point.y)
  const result = {
    xMin: Math.min(...x),
    xMax: Math.max(...x),
    yMin: Math.min(...y),
    yMax: Math.max(...y),
  }
  return result.xMin < result.xMax && result.yMin < result.yMax ? result : null
}

/** Feed one parsed serial reading into the currently armed corner. */
export function captureTouchCalibrationSample(
  capture: TouchCalibrationCapture,
  sample: RawTouchPoint,
): TouchCalibrationCapture {
  if (capture.phase !== 'collecting') return capture
  if (!Number.isInteger(sample.x) || !Number.isInteger(sample.y)
    || sample.x < 0 || sample.x > 4095 || sample.y < 0 || sample.y > 4095) return capture
  const corner = TOUCH_CALIBRATION_CORNERS[capture.cornerIndex].id
  const points = [...capture.samples[corner], sample]
    .slice(0, TOUCH_CALIBRATION_SAMPLES_PER_CORNER)
  const samples = { ...capture.samples, [corner]: points }
  if (points.length < TOUCH_CALIBRATION_SAMPLES_PER_CORNER) {
    return { ...capture, samples, latest: sample }
  }
  if (capture.cornerIndex < TOUCH_CALIBRATION_CORNERS.length - 1) {
    return { ...capture, phase: 'captured', samples, latest: sample }
  }
  const result = touchCalibrationFromSamples(samples)
  return {
    ...capture,
    phase: 'complete',
    samples,
    latest: sample,
    result,
    error: result ? null : 'The captured points do not span both touch axes. Retry the last corner or restart calibration.',
  }
}

function calibrated(raw: number, low: number, high: number, pixels: number): number {
  if (!Number.isFinite(raw) || !Number.isFinite(low) || !Number.isFinite(high) || high <= low || pixels <= 1) return 0
  const unit = Math.max(0, Math.min(1, (raw - low) / (high - low)))
  return Math.round(unit * (pixels - 1))
}

/** Convert a raw controller sample to mounted display pixels. */
export function mapTransportTouch(
  rawX: number,
  rawY: number,
  controller: TftController,
  rotation: TftRotation,
  calibration: TouchCalibration = DEFAULT_XPT2046_CALIBRATION,
): TouchPoint | null {
  if (!Number.isFinite(rawX) || !Number.isFinite(rawY)
    || !Number.isFinite(calibration.xMin) || !Number.isFinite(calibration.xMax)
    || !Number.isFinite(calibration.yMin) || !Number.isFinite(calibration.yMax)
    || calibration.xMax <= calibration.xMin || calibration.yMax <= calibration.yMin) return null
  const x = calibrated(rawX, calibration.xMin, calibration.xMax, controller.width)
  const y = calibrated(rawY, calibration.yMin, calibration.yMax, controller.height)
  switch (rotation) {
    case '90': return { x: controller.height - 1 - y, y: x }
    case '180': return { x: controller.width - 1 - x, y: controller.height - 1 - y }
    case '270': return { x: y, y: controller.width - 1 - x }
    default: return { x, y }
  }
}

export type TransportTouchAction = 'playPause' | 'previous' | 'next' | 'volume' | 'ledToggle' | 'brightness'

export interface TransportTouchRegion {
  action: TransportTouchAction
  rect: TftRect
  /** Continuous controls publish an absolute 0-1 value across this axis. */
  valueAxis?: 'x'
}

/** Interactive regions already visible in each fixed layout. */
export function transportTouchRegions(
  controller: TftController,
  rotation: TftRotation,
  layout: TransportDisplayLayout,
): TransportTouchRegion[] {
  const { width, height } = tftRotatedSize(controller, rotation)
  if (layout === 'Diagnostics' || layout === 'Waiting') return []
  // Show Status is read-only. It used to offer an LED toggle and a brightness
  // bar, but both were drawn from readings a Slideshow does not have; the
  // controls went with them to the custom-display layer, which can wire an LED
  // output's Controls input directly. A panel that reports without commanding
  // is a legitimate state — `findDisplayGeneratorIssues` only objects to a
  // touch chain that reaches nothing, not to a display that publishes none.
  if (layout === 'Show Status') return []
  if (layout === 'Fixed Transport') {
    const g = fixedTransportGeometry(width, height)
    return [
      { action: 'previous', rect: g.previous.rect },
      { action: 'playPause', rect: g.playPause.rect },
      { action: 'next', rect: g.next.rect },
      { action: 'volume', rect: g.volume, valueAxis: 'x' },
    ]
  }
  const g = nowPlayingGeometry(width, height)
  return [
    { action: 'playPause', rect: g.state },
    { action: 'volume', rect: g.volume, valueAxis: 'x' },
  ]
}

export function touchRegionAt(
  point: TouchPoint,
  regions: readonly TransportTouchRegion[],
): { action: TransportTouchAction; value?: number } | null {
  for (const region of regions) {
    const { x, y, w, h } = region.rect
    if (point.x < x || point.y < y || point.x >= x + w || point.y >= y + h) continue
    if (region.valueAxis === 'x') {
      const value = w <= 1 ? 0 : Math.max(0, Math.min(1, (point.x - x) / (w - 1)))
      return { action: region.action, value }
    }
    return { action: region.action }
  }
  return null
}
