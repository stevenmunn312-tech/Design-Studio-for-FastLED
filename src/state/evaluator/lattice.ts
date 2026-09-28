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
