// Digital Rain: streams of light falling along one axis. Shared by the preview
// and the sketch so both index the canvas the same way in all four directions.

export const RAIN_DIRECTIONS = ['down', 'up', 'left', 'right'] as const
export type RainDirection = typeof RAIN_DIRECTIONS[number]
export const rainDirection = (v: unknown): RainDirection =>
  (RAIN_DIRECTIONS as readonly string[]).includes(String(v)) ? (v as RainDirection) : 'down'

export const isVerticalRain = (d: RainDirection) => d === 'down' || d === 'up'

/** Lanes run across the fall (one per column for down/up); `along` is the fall length. */
export function rainGeometry(d: RainDirection, W: number, H: number): { lanes: number; along: number } {
  return isVerticalRain(d) ? { lanes: W, along: H } : { lanes: H, along: W }
}

/** Canvas index of position `pos` along lane `lane`; pos 0 is where streams start. */
export function rainIndex(d: RainDirection, W: number, H: number, lane: number, pos: number): number {
  switch (d) {
    case 'down': return pos * W + lane
    case 'up': return (H - 1 - pos) * W + lane
    case 'right': return lane * W + pos
    default: return lane * W + (W - 1 - pos)
  }
}

/** The same mapping as a C++ expression over `lane` and `pos` variable names. */
export function rainIndexCpp(d: RainDirection, lane: string, pos: string): string {
  switch (d) {
    case 'down': return `${pos}*WIDTH+${lane}`
    case 'up': return `(HEIGHT-1-${pos})*WIDTH+${lane}`
    case 'right': return `${lane}*WIDTH+${pos}`
    default: return `${lane}*WIDTH+(WIDTH-1-${pos})`
  }
}

/** Head cells advanced per frame at full speed and full lane speed. */
export const RAIN_STEP = 0.5
export const RAIN_SPAWN = 0.08
export const RAIN_FLICKER_HZ = 10
