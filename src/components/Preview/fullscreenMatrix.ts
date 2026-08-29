import type { Frame } from '../../state/graphEvaluator'

export const FULLSCREEN_MATRIX_CELL_PX = 20
const MAX_FULLSCREEN_MATRIX_PIXELS = 24_000

export interface FullscreenMatrixDimensions {
  width: number
  height: number
}

/**
 * Build a display-only LED grid from the fullscreen viewport. A 1920x1080
 * screen becomes 96x54. Very large displays increase the cell size just enough
 * to keep the per-frame resample bounded.
 */
export function fullscreenMatrixDimensions(
  screenWidth: number,
  screenHeight: number,
): FullscreenMatrixDimensions {
  const width = Math.max(1, Math.floor(Number.isFinite(screenWidth) ? screenWidth : 1))
  const height = Math.max(1, Math.floor(Number.isFinite(screenHeight) ? screenHeight : 1))
  const performanceCellPx = Math.sqrt(width * height / MAX_FULLSCREEN_MATRIX_PIXELS)
  const cellPx = Math.max(FULLSCREEN_MATRIX_CELL_PX, performanceCellPx)
  return {
    width: Math.max(1, Math.floor(width / cellPx)),
    height: Math.max(1, Math.floor(height / cellPx)),
  }
}

/** Bilinearly expand a physical frame into the temporary fullscreen grid. */
export function resampleFullscreenFrame(
  source: Frame,
  width: number,
  height: number,
  reuse?: Frame | null,
): Frame {
  const sourceHeight = source.length
  const sourceWidth = source[0]?.length ?? 0
  if (sourceWidth === width && sourceHeight === height) return source

  const output = reuse?.length === height && reuse[0]?.length === width
    ? reuse
    : Array.from({ length: height }, () => Array.from({ length: width }, () => ({ r: 0, g: 0, b: 0 })))
  if (sourceWidth === 0 || sourceHeight === 0) return output

  for (let y = 0; y < height; y++) {
    const sy = height === 1 ? 0 : y * (sourceHeight - 1) / (height - 1)
    const y0 = Math.floor(sy)
    const y1 = Math.min(sourceHeight - 1, y0 + 1)
    const fy = sy - y0
    for (let x = 0; x < width; x++) {
      const sx = width === 1 ? 0 : x * (sourceWidth - 1) / (width - 1)
      const x0 = Math.floor(sx)
      const x1 = Math.min(sourceWidth - 1, x0 + 1)
      const fx = sx - x0
      const p00 = source[y0]?.[x0] ?? { r: 0, g: 0, b: 0 }
      const p10 = source[y0]?.[x1] ?? p00
      const p01 = source[y1]?.[x0] ?? p00
      const p11 = source[y1]?.[x1] ?? p01
      const topR = p00.r + (p10.r - p00.r) * fx
      const topG = p00.g + (p10.g - p00.g) * fx
      const topB = p00.b + (p10.b - p00.b) * fx
      const bottomR = p01.r + (p11.r - p01.r) * fx
      const bottomG = p01.g + (p11.g - p01.g) * fx
      const bottomB = p01.b + (p11.b - p01.b) * fx
      const pixel = output[y][x]
      pixel.r = topR + (bottomR - topR) * fy
      pixel.g = topG + (bottomG - topG) * fy
      pixel.b = topB + (bottomB - topB) * fy
    }
  }
  return output
}
