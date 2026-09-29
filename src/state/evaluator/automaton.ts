// Cellular automata on the canvas, shared by the Automaton preview and its
// firmware twin. State is one byte per cell. Every step is a pure function of
// the cells (plus, for sand, the spawn draws made by the caller), so the C++
// loops in nodes/field/codegen.ts can repeat them line for line.

export const AUTOMATON_TYPES = ['elementary', 'cyclic', 'brianBrain', 'sand'] as const
export type AutomatonType = typeof AUTOMATON_TYPES[number]
export const automatonType = (v: unknown): AutomatonType =>
  (AUTOMATON_TYPES as readonly string[]).includes(String(v)) ? (v as AutomatonType) : 'elementary'

export const CYCLIC_STATES_MIN = 3
export const CYCLIC_STATES_MAX = 16
export const CYCLIC_THRESHOLD_MIN = 1
export const CYCLIC_THRESHOLD_MAX = 8
export const AUTOMATON_SPEED_MIN = 1
export const AUTOMATON_SPEED_MAX = 60
export const SAND_SPAWN_RATE = 0.3
/** Brian's Brain states: 0 off, 1 dying, 2 on. */
export const BRAIN_STATES = 3

export const cyclicStates = (v: unknown) => Math.max(CYCLIC_STATES_MIN, Math.min(CYCLIC_STATES_MAX, Math.floor(Number(v) || 0)))
export const cyclicThreshold = (v: unknown) => Math.max(CYCLIC_THRESHOLD_MIN, Math.min(CYCLIC_THRESHOLD_MAX, Math.floor(Number(v) || 0)))
export const elementaryRule = (v: unknown) => Math.max(0, Math.min(255, Math.floor(Number(v) || 0)))

/** How many distinct states the type uses; the field is `state / (states - 1)`. */
export function automatonStates(type: AutomatonType, cyclic: number): number {
  return type === 'cyclic' ? cyclic : type === 'brianBrain' ? BRAIN_STATES : 2
}

/** Steps between frames: `speed` steps a second at 60 frames a second. */
export function automatonInterval(speed: number): number {
  const s = Number.isFinite(speed) ? speed : 8
  return Math.max(1, Math.round(60 / Math.max(AUTOMATON_SPEED_MIN, Math.min(AUTOMATON_SPEED_MAX, s))))
}

/** A single live cell in the middle of the top row: rule 90 grows Sierpinski's triangle from it. */
export function seedElementary(cells: Uint8Array, W: number, H: number, random: (() => number) | null): void {
  cells.fill(0)
  if (H < 1) return
  if (random) for (let x = 0; x < W; x++) cells[x] = random() < 0.5 ? 1 : 0
  else cells[Math.floor(W / 2)] = 1
}

/** Scroll every row down one and compute a new top row from the old one (edges wrap). */
export function stepElementary(cells: Uint8Array, W: number, H: number, rule: number): void {
  const row = new Uint8Array(W)
  for (let x = 0; x < W; x++) {
    const l = cells[(x - 1 + W) % W], c = cells[x], r = cells[(x + 1) % W]
    row[x] = (rule >> (l * 4 + c * 2 + r)) & 1
  }
  for (let y = H - 1; y > 0; y--) cells.copyWithin(y * W, (y - 1) * W, y * W)
  cells.set(row, 0)
}

/** Count of the eight neighbours (torus) whose state satisfies `pick`. */
function neighbours(cells: Uint8Array, W: number, H: number, x: number, y: number, pick: (s: number) => boolean): number {
  let n = 0
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue
      if (pick(cells[((y + dy + H) % H) * W + ((x + dx + W) % W)])) n++
    }
  }
  return n
}

/** Cyclic automaton: a cell advances to the next state once `threshold` neighbours already hold it. */
export function stepCyclic(cells: Uint8Array, next: Uint8Array, W: number, H: number, states: number, threshold: number): void {
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const s = cells[y * W + x], want = (s + 1) % states
      next[y * W + x] = neighbours(cells, W, H, x, y, (v) => v === want) >= threshold ? want : s
    }
  }
}

/** Brian's Brain: off becomes on with exactly two on neighbours; on becomes dying; dying becomes off. */
export function stepBrain(cells: Uint8Array, next: Uint8Array, W: number, H: number): void {
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const s = cells[y * W + x]
      next[y * W + x] = s === 2 ? 1 : s === 1 ? 0 : neighbours(cells, W, H, x, y, (v) => v === 2) === 2 ? 2 : 0
    }
  }
}

/**
 * Falling sand: each grain drops straight down, else slides down a diagonal,
 * leaning left or right by the parity of `x + y + step`. Rows are visited from
 * the bottom up, so a grain moves once a step. The sides do not wrap.
 */
export function stepSand(cells: Uint8Array, W: number, H: number, step: number): void {
  for (let y = H - 2; y >= 0; y--) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x
      if (!cells[i]) continue
      const below = i + W
      if (!cells[below]) { cells[below] = 1; cells[i] = 0; continue }
      const first = ((x + y + step) & 1) === 0 ? -1 : 1
      for (const dir of [first, -first]) {
        const nx = x + dir
        if (nx < 0 || nx >= W || cells[below + dir]) continue
        cells[below + dir] = 1; cells[i] = 0
        break
      }
    }
  }
}

/** True when a pile has climbed into half the top row and the sand should clear. */
export function sandJammed(cells: Uint8Array, W: number): boolean {
  let n = 0
  for (let x = 0; x < W; x++) n += cells[x]
  return n * 2 >= W
}
