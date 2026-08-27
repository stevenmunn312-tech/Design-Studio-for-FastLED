// Shared touch geometry for the fixed Transport Display layouts.
//
// Raw XPT2046 readings are calibrated in the panel's native portrait space,
// then rotated into the same mounted coordinate system `TftSurface` uses.
// Hit regions come from the layout geometry itself: the visible control and
// the thing that responds can therefore never drift apart.

import { nowPlayingGeometry, showStatusGeometry, type TransportDisplayLayout } from './transportDisplay'
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

export type TransportTouchAction = 'playPause' | 'volume' | 'ledToggle' | 'brightness'

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
  if (layout === 'Show Status') {
    const g = showStatusGeometry(width, height)
    return [
      { action: 'ledToggle', rect: g.output },
      { action: 'brightness', rect: g.brightness, valueAxis: 'x' },
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
