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

export function truchetOrientationCount(lattice: TruchetLattice, motif: TruchetMotif): number {
  if (lattice === 'hex') return 2
  return motif === 'smith' ? 1 : 2
}
