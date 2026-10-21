import { describe, expect, it } from 'vitest'
import { WALLPAPER_GROUPS, wallpaperGroupIndex, type WallpaperGroup } from '../symmetry'
import { foldWallpaperQ12 } from '../../../nodes/shared/integerPatterns'

interface Transform { rotate?: number; reflect?: 'x' | 'y' }

const GENERATORS: Record<WallpaperGroup, Transform[]> = {
  p1: [],
  p2: [{ rotate: Math.PI }],
  pm: [{ reflect: 'x' }],
  pmm: [{ reflect: 'x' }, { reflect: 'y' }],
  p4: [{ rotate: Math.PI / 2 }],
  p4m: [{ rotate: Math.PI / 2 }, { reflect: 'y' }],
  p3: [{ rotate: Math.PI * 2 / 3 }],
  p6: [{ rotate: Math.PI / 3 }],
  p6m: [{ rotate: Math.PI / 3 }, { reflect: 'y' }],
}

function transform(x: number, y: number, generator: Transform) {
  if (generator.reflect === 'x') return { x: -x, y }
  if (generator.reflect === 'y') return { x, y: -y }
  const angle = generator.rotate ?? 0
  const cos = Math.cos(angle), sin = Math.sin(angle)
  return { x: x * cos - y * sin, y: x * sin + y * cos }
}

/** Every image of (x, y) under the group, by applying its generators until no new point appears. */
function orbit(group: WallpaperGroup, x: number, y: number): { x: number; y: number }[] {
  const points = [{ x, y }]
  for (let i = 0; i < points.length && points.length < 24; i++) {
    for (const generator of GENERATORS[group]) {
      const next = transform(points[i].x, points[i].y, generator)
      if (!points.some((p) => Math.abs(p.x - next.x) < 1e-6 && Math.abs(p.y - next.y) < 1e-6)) points.push(next)
    }
  }
  return points
}

// The integer fold works in 1/4096 cell and rebuilds the point with sin16,
// whose piecewise-linear error is a few parts in a thousand: a point lands
// within 16 units (0.004 cell) of where the exact fold would put it.
const fold = (group: WallpaperGroup, x: number, y: number) =>
  foldWallpaperQ12(wallpaperGroupIndex(group), Math.round(x * 4096), Math.round(y * 4096))

describe('foldWallpaperQ12', () => {
  it('is idempotent for every shipped group', () => {
    for (const group of WALLPAPER_GROUPS) {
      for (let y = -0.49; y <= 0.49; y += 0.073) for (let x = -0.49; x <= 0.49; x += 0.067) {
        const first = fold(group, x, y)
        const second = foldWallpaperQ12(wallpaperGroupIndex(group), first[0], first[1])
        // A point rebuilt a hair past a sector edge refolds to another copy
        // in its orbit under the group: the same pixel by symmetry. sin16's
        // error grows with the radius, so the tolerance does too.
        const tolerance = Math.max(16, Math.hypot(first[0], first[1]) * 0.01)
        const near = orbit(group, first[0], first[1]).some((c) => Math.abs(second[0] - c.x) <= tolerance && Math.abs(second[1] - c.y) <= tolerance)
        expect(near, `${group} (${first}) -> (${second})`).toBe(true)
      }
    }
  })

  it('maps every group generator to the same fundamental-domain point', () => {
    for (const group of WALLPAPER_GROUPS) {
      for (const generator of GENERATORS[group]) {
        for (const [x, y] of [[0.11, 0.23], [-0.37, 0.08], [0.29, -0.31]]) {
          const base = fold(group, x, y)
          const moved = transform(x, y, generator)
          const folded = fold(group, moved.x, moved.y)
          expect(Math.abs(folded[0] - base[0]), `${group} x`).toBeLessThanOrEqual(16)
          expect(Math.abs(folded[1] - base[1]), `${group} y`).toBeLessThanOrEqual(16)
        }
      }
    }
  })
})
