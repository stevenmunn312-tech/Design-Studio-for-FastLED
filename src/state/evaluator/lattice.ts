export interface LatticeCell {
  /** Local point measured from the containing cell's centre. */
  x: number
  y: number
  /** Stable integer coordinates for tests and later per-cell hashing. */
  a: number
  b: number
  /** Triangle cells alternate between upward and downward orientation. */
  flipped: boolean
}

export interface FanFold {
  x: number
  y: number
  sector: number
}

const SQRT3 = Math.sqrt(3)

/** Unit square lattice with integer cell centres. */
export function squareCell(x: number, y: number): LatticeCell {
  const a = Math.round(x)
  const b = Math.round(y)
  return { x: x - a, y: y - b, a, b, flipped: false }
}

/** Flat-top hexagons with horizontal centre spacing 1 (circumradius 2/3). */
export function hexCell(x: number, y: number): LatticeCell {
  const radius = 2 / 3
  let q = (2 / 3 * x) / radius
  let r = (-x / 3 + SQRT3 * y / 3) / radius
  const cubeX = q, cubeZ = r, cubeY = -q - r
  let rx = Math.round(cubeX), ry = Math.round(cubeY), rz = Math.round(cubeZ)
  const dx = Math.abs(rx - cubeX), dy = Math.abs(ry - cubeY), dz = Math.abs(rz - cubeZ)
  if (dx > dy && dx > dz) rx = -ry - rz
  else if (dy > dz) ry = -rx - rz
  else rz = -rx - ry
  q = rx; r = rz
  const cx = radius * 1.5 * q
  const cy = radius * SQRT3 * (r + q / 2)
  return { x: x - cx, y: y - cy, a: rx, b: rz, flipped: false }
}

/** Equilateral-triangle lattice with unit edges. */
export function triCell(x: number, y: number): LatticeCell {
  // Coordinates in the oblique basis e1=(1,0), e2=(1/2,sqrt(3)/2).
  const u = x - y / SQRT3
  const v = 2 * y / SQRT3
  const i = Math.floor(u), j = Math.floor(v)
  const fu = u - i, fv = v - j
  const flipped = fu + fv > 1
  const cu = flipped ? i + 2 / 3 : i + 1 / 3
  const cv = flipped ? j + 2 / 3 : j + 1 / 3
  const cx = cu + cv / 2
  const cy = cv * SQRT3 / 2
  return { x: x - cx, y: y - cy, a: i, b: j, flipped }
}

/**
 * Multipliers for `latticeHash`, interpolated into the sketch's
 * `_latticeCellValue` so the two cannot disagree on a number: the cell term,
 * the row term, the seed term and the final mix.
 */
export const LATTICE_HASH_MULTIPLIERS = [374761393, 668265263, 2246822519, 1274126177] as const

/**
 * Integer hash of lattice coordinates to 24 bits. Unsigned 32-bit arithmetic
 * throughout, keeping the top 24 bits, so a float32 holds anything made from
 * it exactly and the sketch's twin returns the same number, not a close one.
 */
function latticeHashBits(a: number, b: number, seed: number): number {
  const [ma, mb, ms, mix] = LATTICE_HASH_MULTIPLIERS
  let h = (Math.imul(a | 0, ma) + Math.imul(b | 0, mb) + Math.imul(seed | 0, ms)) | 0
  h = Math.imul(h ^ (h >>> 13), mix)
  h ^= h >>> 16
  return h >>> 8
}

/** `latticeHashBits` as a value in [0, 1). */
export function latticeHash(a: number, b: number, seed: number): number {
  return latticeHashBits(a, b, seed) / 16777216
}

/**
 * One value per lattice cell, in [0.25, 1). Triangle cells come in pairs on
 * one (a, b), so the orientation is folded into the key; every point of a cell
 * reads the same value however the lattice is rotated.
 *
 * The floor is for the job the value does: multiplied into Slice Tiling's
 * field it colours a polygon's solid slices, and the empty slices around them
 * are 0. A cell hashed near 0 would take their colour and vanish. Still
 * integer arithmetic (2^22 plus three quarters of the 24 bits), so exact.
 */
export function latticeCellValue(cell: LatticeCell, seed: number): number {
  const bits = latticeHashBits(cell.a * 2 + (cell.flipped ? 1 : 0), cell.b, seed)
  return (4194304 + ((bits * 3) >>> 2)) / 16777216
}

/**
 * Rotate a point into one regular polygon fan sector. Dihedral mode mirrors
 * alternate sectors, giving neighbouring copies opposite handedness.
 */
export function fanFold(x: number, y: number, sides: number, dihedral: boolean): FanFold {
  const n = Math.max(3, Math.round(sides))
  const sectorAngle = Math.PI * 2 / n
  const angle = Math.atan2(y, x)
  const rawSector = Math.floor((angle + sectorAngle / 2) / sectorAngle)
  const sector = ((rawSector % n) + n) % n
  let folded = angle - rawSector * sectorAngle
  if (dihedral && (sector & 1) !== 0) folded = -folded
  const radius = Math.hypot(x, y)
  return { x: radius * Math.cos(folded), y: radius * Math.sin(folded), sector }
}
