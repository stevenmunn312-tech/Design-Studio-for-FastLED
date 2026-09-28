import { hexCell, latticeHash, squareCell, type LatticeCell } from './lattice'

export const TRUCHET_LATTICES = ['square', 'hex'] as const
export const TRUCHET_MOTIFS = ['arcs', 'diagonals', 'smith', 'hexArcs', 'tenPrint'] as const

export type TruchetLattice = typeof TRUCHET_LATTICES[number]
export type TruchetMotif = typeof TRUCHET_MOTIFS[number]

export function truchetLattice(value: unknown): TruchetLattice {
  return value === 'hex' ? 'hex' : 'square'
}

/** A stale or incompatible saved motif falls back to the first motif for its lattice. */
export function truchetMotif(value: unknown, lattice: TruchetLattice): TruchetMotif {
  if (lattice === 'hex') return 'hexArcs'
  return value === 'diagonals' || value === 'smith' || value === 'tenPrint' ? value : 'arcs'
}

export function truchetMotifIndex(value: unknown, lattice: TruchetLattice): number {
  return TRUCHET_MOTIFS.indexOf(truchetMotif(value, lattice))
}

function segmentDistance(
  px: number, py: number, ax: number, ay: number, bx: number, by: number,
): number {
  const vx = bx - ax, vy = by - ay
  const wx = px - ax, wy = py - ay
  const vv = vx * vx + vy * vy
  const t = vv > 0 ? Math.max(0, Math.min(1, (wx * vx + wy * vy) / vv)) : 0
  return Math.hypot(px - (ax + t * vx), py - (ay + t * vy))
}

function cornerArcDistance(x: number, y: number, cx: number, cy: number, radius: number): number {
  return Math.abs(Math.hypot(x - cx, y - cy) - radius)
}

/** Distance, in cell units, to a motif's centreline in one canonical lattice cell. */
export function truchetMotifDistance(
  lattice: TruchetLattice,
  motif: TruchetMotif,
  x: number,
  y: number,
  orientation: number,
): number {
  if (lattice === 'hex') {
    // Three alternating hexagon vertices each carry a radius-R/2 arc. Every
    // edge midpoint belongs to one arc, so neighbouring cells always join.
    const radius = 2 / 3
    let distance = Infinity
    for (let i = 0; i < 3; i++) {
      const angle = (orientation % 2 + i * 2) * Math.PI / 3
      const cx = radius * Math.cos(angle), cy = radius * Math.sin(angle)
      distance = Math.min(distance, cornerArcDistance(x, y, cx, cy, radius / 2))
    }
    return distance
  }

  const flip = (orientation & 1) !== 0
  if (motif === 'tenPrint') return Math.abs(y - (flip ? -x : x)) / Math.SQRT2

  if (motif === 'smith') {
    let distance = Infinity
    for (const cx of [-0.5, 0.5]) for (const cy of [-0.5, 0.5]) {
      distance = Math.min(distance, cornerArcDistance(x, y, cx, cy, 0.5))
    }
    return distance
  }

  const sy = flip ? -1 : 1
  if (motif === 'diagonals') {
    return Math.min(
      segmentDistance(x, y, -0.5, 0, 0, 0.5 * sy),
      segmentDistance(x, y, 0.5, 0, 0, -0.5 * sy),
    )
  }

  return Math.min(
    cornerArcDistance(x, y, -0.5, 0.5 * sy, 0.5),
    cornerArcDistance(x, y, 0.5, -0.5 * sy, 0.5),
  )
}

export function truchetCell(x: number, y: number, lattice: TruchetLattice): LatticeCell {
  return lattice === 'hex' ? hexCell(x, y) : squareCell(x, y)
}

export function truchetOrientation(cell: LatticeCell, epoch: number, seed: number, count: number): number {
  const hash = latticeHash(cell.a + epoch * 31, cell.b - epoch * 17, seed)
  return Math.min(count - 1, Math.floor(hash * count))
}

export function truchetOrientationCount(lattice: TruchetLattice, motif: TruchetMotif): number {
  if (lattice === 'hex') return 2
  return motif === 'smith' ? 1 : 2
}

export function truchetLineValue(distance: number, lineWidth: number): number {
  const width = Math.max(0, Math.min(0.5, lineWidth))
  if (width <= 0) return distance <= 1e-7 ? 1 : 0
  const t = Math.max(0, Math.min(1, distance / width))
  return 1 - t * t * (3 - 2 * t)
}
