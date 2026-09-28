import { describe, expect, it } from 'vitest'
import { foldWallpaper, WALLPAPER_GROUPS, type WallpaperGroup } from '../symmetry'

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

describe('foldWallpaper', () => {
  it('is idempotent for every shipped group', () => {
    for (const group of WALLPAPER_GROUPS) {
      for (let y = -0.49; y <= 0.49; y += 0.073) for (let x = -0.49; x <= 0.49; x += 0.067) {
        const first = foldWallpaper(group, x, y)
        const second = foldWallpaper(group, first.x, first.y)
        expect(second.x, `${group} x`).toBeCloseTo(first.x, 10)
        expect(second.y, `${group} y`).toBeCloseTo(first.y, 10)
      }
    }
  })

  it('maps every group generator to the same fundamental-domain point', () => {
    for (const group of WALLPAPER_GROUPS) {
      for (const generator of GENERATORS[group]) {
        for (const [x, y] of [[0.11, 0.23], [-0.37, 0.08], [0.29, -0.31]]) {
          const base = foldWallpaper(group, x, y)
          const moved = transform(x, y, generator)
          const folded = foldWallpaper(group, moved.x, moved.y)
          expect(folded.x, `${group} x`).toBeCloseTo(base.x, 10)
          expect(folded.y, `${group} y`).toBeCloseTo(base.y, 10)
        }
      }
    }
  })
})
