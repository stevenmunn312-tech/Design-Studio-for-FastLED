import { hexCell, squareCell } from './lattice'

export const WALLPAPER_GROUPS = ['p1', 'p2', 'pm', 'pmm', 'p4', 'p4m', 'p3', 'p6', 'p6m'] as const

export type WallpaperGroup = typeof WALLPAPER_GROUPS[number]

export interface WallpaperPoint {
  x: number
  y: number
}

const GROUP_INDEX = new Map<string, number>(WALLPAPER_GROUPS.map((group, index) => [group, index]))

/** Unknown persisted values fail back to translation-only p1. */
export function wallpaperGroupIndex(group: unknown): number {
  return GROUP_INDEX.get(String(group)) ?? 0
}

export function wallpaperGroupUsesHexLattice(group: unknown): boolean {
  return wallpaperGroupIndex(group) >= 6
}

function cyclicFold(x: number, y: number, rotations: number, mirror: boolean): WallpaperPoint {
  const sector = Math.PI * 2 / rotations
  const radius = Math.hypot(x, y)
  let angle = Math.atan2(y, x)
  angle -= Math.floor((angle + sector / 2) / sector) * sector
  if (mirror) angle = Math.abs(angle)
  return { x: radius * Math.cos(angle), y: radius * Math.sin(angle) }
}

/**
 * Fold a lattice-cell-local point into one wallpaper group's fundamental
 * domain. The numeric group ids are append-only and mirrored by
 * `symmetryHelperCpp.ts`, so a generated sketch cannot interpret a select
 * value differently from the preview.
 */
export function foldWallpaper(group: unknown, x: number, y: number): WallpaperPoint {
  switch (wallpaperGroupIndex(group)) {
    case 1: return cyclicFold(x, y, 2, false) // p2: half-turn
    case 2: return { x: Math.abs(x), y } // pm: one mirror axis
    case 3: return { x: Math.abs(x), y: Math.abs(y) } // pmm: two mirror axes
    case 4: return cyclicFold(x, y, 4, false) // p4: quarter-turn
    case 5: return cyclicFold(x, y, 4, true) // p4m: 45-degree wedge
    case 6: return cyclicFold(x, y, 3, false) // p3: 120-degree sector
    case 7: return cyclicFold(x, y, 6, false) // p6: 60-degree sector
    case 8: return cyclicFold(x, y, 6, true) // p6m: 30-degree wedge
    default: return { x, y } // p1: translations only
  }
}

/** Resolve one output pixel to the centred source coordinate sampled by both
 * symmetry nodes. Canvas Y deliberately uses the width scale too, keeping
 * lattice cells regular on a non-square matrix. */
export function wallpaperSamplePoint(
  group: unknown,
  x: number,
  y: number,
  cellsValue: number,
  rotationDeg: number,
  spinDeg: number,
  offsetXValue: number,
  offsetYValue: number,
  t: number,
  width: number,
  height: number,
): WallpaperPoint {
  const cells = Math.max(0.5, Math.min(8, cellsValue))
  const rotation = Math.max(-180, Math.min(180, rotationDeg))
  const spin = Math.max(-360, Math.min(360, spinDeg))
  const offsetX = Math.max(-8, Math.min(8, offsetXValue))
  const offsetY = Math.max(-8, Math.min(8, offsetYValue))
  const angle = -(rotation + spin * t) * Math.PI / 180
  const cos = Math.cos(angle), sin = Math.sin(angle)
  const px = (x + 0.5 - width / 2) * cells / width
  const py = (y + 0.5 - height / 2) * cells / width
  const rx = cos * px - sin * py + offsetX
  const ry = sin * px + cos * py + offsetY
  const cell = wallpaperGroupUsesHexLattice(group) ? hexCell(rx, ry) : squareCell(rx, ry)
  const folded = foldWallpaper(group, cell.x, cell.y)
  return {
    x: (width - 1) / 2 + folded.x * width,
    y: (height - 1) / 2 + folded.y * width,
  }
}
