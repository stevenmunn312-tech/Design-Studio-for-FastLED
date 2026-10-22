// Dance Flash silhouettes. One 16×16 picture per pose, scaled to the largest
// square the matrix holds and centred, with nearest-neighbour sampling, so a
// figure keeps its shape on a wide or tall panel; and a clock both the
// preview and the sketch follow. Times are whole milliseconds so the two sides pick the
// same pose from the same seed; `t` only decides when a flash is on.
import type { Frame, RGB } from '../../state/palettes/ledColor'
import { blankFrame, cloneFrame } from '../../state/evaluator/frames'

export const DANCE_SIZE = 16
export const DANCE_FIGURE_COUNT = 4
/** How long one silhouette stays lit. */
export const DANCE_FLASH_HOLD_MS = 180
/** Quiet time after a flash, before the next one may start: two minutes. */
export const DANCE_FLASH_GAP_MIN_MS = 120000
/** Added to the minimum gap as `rng % span`, so the gap is 2:00–4:59.999. */
export const DANCE_FLASH_GAP_SPAN_MS = 180000
/** First flash, so a new pattern shows the feature without waiting a full gap. */
export const DANCE_FLASH_FIRST_MIN_MS = 2500
export const DANCE_FLASH_FIRST_SPAN_MS = 3500
/** A wired beat may delay a due flash this long, then it fires anyway. */
export const DANCE_FLASH_BEAT_WAIT_MS = 4000
/** Numerical Recipes LCG. uint32 wrap, matching the sketch's unsigned multiply. */
export const DANCE_LCG_A = 1664525
export const DANCE_LCG_C = 1013904223

export const DANCE_FIGURES = ['dj', 'man', 'woman', 'couple'] as const
export type DanceFigure = typeof DANCE_FIGURES[number]

// '#' is a lit pixel. Bit 15 is the left column, so a row reads left to right.
// DJ: headphones on, both arms down to a deck with two platters. Man: one arm
// punched up, the other out, legs in a wide stance. Woman: long hair, one arm
// up, the other out, a flared dress over her legs. Couple: hands joined high
// above their heads, outer arms down, his trousers and her dress.
const DANCE_ART: readonly (readonly string[])[] = [
  [
    '....########....',
    '..##..####..##..',
    '..##.######.##..',
    '..##.######.##..',
    '.....######.....',
    '......####......',
    '....########....',
    '..############..',
    '.###..####..###.',
    '.##...####...##.',
    '.##..######..##.',
    '################',
    '#.####.##.####.#',
    '#.#..#.##.#..#.#',
    '#.####.##.####.#',
    '################',
  ],
  [
    '............##..',
    '...........##...',
    '.....####..##...',
    '.....####.##....',
    '......##.##.....',
    '...#########....',
    '..##..#####.....',
    '.##...#####.....',
    '.#....#####.....',
    '......#####.....',
    '.....##...##....',
    '....##.....##...',
    '...##.......##..',
    '..##.........##.',
    '.##...........##',
    '###..........###',
  ],
  [
    '..............##',
    '.............##.',
    '....####....##..',
    '...######..##...',
    '...######.##....',
    '...##.####.#....',
    '...##..##.#.....',
    '..#..######.....',
    '.#....####......',
    '......####......',
    '.....######.....',
    '....########....',
    '...##########...',
    '..############..',
    '.....##...##....',
    '....###...###...',
  ],
  [
    '..###......####.',
    '.#####.##.######',
    '.#####.##.######',
    '..###..##.#.##.#',
    '...#...##...##..',
    '..###.#..#..###.',
    '#.####....####.#',
    '#..###....####..',
    '...###.....###..',
    '...###....#####.',
    '..##.##...######',
    '..#...#..#######',
    '.##...##.#######',
    '.#.....#.#######',
    '##.....##..#.#..',
    '##.....##.##.##.',
  ],
]

function rowsOf(art: readonly string[]): readonly number[] {
  return art.map((row, y) => {
    if (row.length !== DANCE_SIZE) throw new Error(`Dance Flash row ${y} is ${row.length} pixels`)
    let bits = 0
    for (let x = 0; x < DANCE_SIZE; x++) {
      const pixel = row[x]
      if (pixel !== '#' && pixel !== '.') throw new Error(`Dance Flash pixel '${pixel}'`)
      if (pixel === '#') bits |= 1 << (DANCE_SIZE - 1 - x)
    }
    return bits >>> 0
  })
}

/** Four figures, each 16 rows of 16 bits. Bit 15 is the left pixel. */
export const DANCE_ROWS: readonly (readonly number[])[] = DANCE_ART.map(rowsOf)

export function danceRowsLiteral(): string {
  return DANCE_ROWS.map((rows) => `{${rows.map((bits) => `0x${bits.toString(16).padStart(4, '0')}`).join(',')}}`).join(',')
}

export function danceLcg(state: number): number {
  return (Math.imul(state, DANCE_LCG_A) + DANCE_LCG_C) >>> 0
}

/**
 * Where the picture lands: the largest square the matrix holds, centred. A
 * 26×17 panel draws the figure 17 pixels tall in the middle 17 columns rather
 * than smearing it across all 26.
 */
export function danceFit(width: number, height: number): { size: number; offX: number; offY: number } {
  const size = Math.max(1, Math.min(width, height))
  return { size, offX: Math.floor((width - size) / 2), offY: Math.floor((height - size) / 2) }
}

/**
 * Source pixel for screen (`x`, `y`), or null outside the fitted square.
 * `mirror` flips the picture left to right within the square.
 */
export function danceSource(
  x: number,
  y: number,
  width: number,
  height: number,
  mirror: boolean,
): { sx: number; sy: number } | null {
  const { size, offX, offY } = danceFit(width, height)
  const fx = x - offX
  const fy = y - offY
  if (fx < 0 || fy < 0 || fx >= size || fy >= size) return null
  const sx = Math.min(DANCE_SIZE - 1, Math.floor((fx * DANCE_SIZE) / size))
  const sy = Math.min(DANCE_SIZE - 1, Math.floor((fy * DANCE_SIZE) / size))
  return { sx: mirror ? DANCE_SIZE - 1 - sx : sx, sy }
}

export function danceLit(
  figure: number,
  x: number,
  y: number,
  width: number,
  height: number,
  mirror: boolean,
): boolean {
  const source = danceSource(x, y, width, height, mirror)
  if (!source) return false
  const row = DANCE_ROWS[figure]?.[source.sy] ?? 0
  return ((row >> (DANCE_SIZE - 1 - source.sx)) & 1) === 1
}

export interface DanceFlashClock {
  /** Seed 0 draws with `random01` instead of the LCG, matching an unseeded sketch. */
  free: boolean
  rng: number
  nextAt: number
  until: number
  figure: number
  mirror: boolean
  prevBeat: boolean
}

export function danceFlashStart(seed: number, random01: () => number = Math.random): DanceFlashClock {
  if (!seed) {
    const first = DANCE_FLASH_FIRST_MIN_MS + Math.floor(random01() * DANCE_FLASH_FIRST_SPAN_MS)
    return { free: true, rng: 0, nextAt: first / 1000, until: -1, figure: 0, mirror: false, prevBeat: false }
  }
  const rng = danceLcg(seed >>> 0)
  const first = DANCE_FLASH_FIRST_MIN_MS + (rng % DANCE_FLASH_FIRST_SPAN_MS)
  return { free: false, rng, nextAt: first / 1000, until: -1, figure: 0, mirror: false, prevBeat: false }
}

/**
 * Advance one frame. Returns whether the silhouette is showing.
 * A wired beat holds a due flash for the next rising edge, then gives up
 * after `DANCE_FLASH_BEAT_WAIT_MS` so a quiet input still flashes.
 */
export function danceFlashAdvance(
  clock: DanceFlashClock,
  t: number,
  beat: boolean,
  beatWired: boolean,
  random01: () => number = Math.random,
): boolean {
  const level = beatWired && beat
  const rising = level && !clock.prevBeat
  clock.prevBeat = level
  if (t < clock.until) return true
  if (t < clock.nextAt) return false
  const late = beatWired && t >= clock.nextAt + DANCE_FLASH_BEAT_WAIT_MS / 1000
  if (beatWired && !rising && !late) return false
  if (clock.free) {
    clock.figure = Math.floor(random01() * DANCE_FIGURE_COUNT) % DANCE_FIGURE_COUNT
    clock.mirror = random01() < 0.5
    const gap = DANCE_FLASH_GAP_MIN_MS + Math.floor(random01() * DANCE_FLASH_GAP_SPAN_MS)
    clock.until = t + DANCE_FLASH_HOLD_MS / 1000
    clock.nextAt = clock.until + gap / 1000
    return true
  }
  clock.rng = danceLcg(clock.rng)
  clock.figure = clock.rng % DANCE_FIGURE_COUNT
  clock.rng = danceLcg(clock.rng)
  clock.mirror = (clock.rng & 1) === 1
  clock.rng = danceLcg(clock.rng)
  const gap = DANCE_FLASH_GAP_MIN_MS + (clock.rng % DANCE_FLASH_GAP_SPAN_MS)
  clock.until = t + DANCE_FLASH_HOLD_MS / 1000
  clock.nextAt = clock.until + gap / 1000
  return true
}

/** Tick (60 fps evaluator clock) in the middle of the first seeded flash. */
export function dancePreviewTick(seed: number): number {
  const clock = danceFlashStart(seed || 1, () => 0)
  return Math.ceil((clock.nextAt + DANCE_FLASH_HOLD_MS / 2000) * 60)
}

/** Copy `base` and replace the fitted silhouette's pixels. */
export function stampDanceFlash(
  base: Frame | null,
  width: number,
  height: number,
  figure: number,
  mirror: boolean,
  color: RGB,
): Frame {
  const frame = base ? cloneFrame(base) : blankFrame(width, height)
  for (let y = 0; y < height; y++) {
    const row = frame[y]
    for (let x = 0; x < width; x++) {
      if (!danceLit(figure, x, y, width, height, mirror)) continue
      const pixel = row[x]
      pixel.r = color.r
      pixel.g = color.g
      pixel.b = color.b
    }
  }
  return frame
}
