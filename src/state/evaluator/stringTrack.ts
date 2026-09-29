import { ringSampleMap } from '../ledOutputForm'

/**
 * The 1-D track a string-first node draws along. `row` is the canvas's middle
 * row (a string's only row), `column` its middle column, and `ring` the
 * inscribed circle through pixel centres that `ringSampleMap` reads, so a
 * position on the track is a pixel an LED Ring actually samples.
 *
 * Shared by String Particles and, in Phase 10, Gauge: both sides of each node
 * ask this one module which canvas pixel a track position lands on.
 */
export const STRING_TRACKS = ['row', 'column', 'ring'] as const
export type StringTrack = typeof STRING_TRACKS[number]

export const RING_TRACK_MIN = 3
export const RING_TRACK_MAX = 300
export const RING_TRACK_DEFAULT = 60

export function stringTrack(value: unknown): StringTrack {
  return (STRING_TRACKS as readonly unknown[]).includes(value) ? value as StringTrack : 'row'
}

/** Most particles a String Particles pool holds: about 17 bytes each on the device. */
export const MAX_STRING_PARTICLES = 64
export const STRING_PARTICLE_MODES = ['drift', 'meteors'] as const

/** Life a particle loses each frame, by kind: drift, ambient, meteor, debris. */
export const STRING_PARTICLE_DECAY = [0.012, 0.02, 0.012, 0.05] as const

/** How many LEDs the ring track runs through. Match the LED output's LED count for an exact fit. */
export function ringTrackLeds(value: unknown): number {
  const n = Math.round(Number(value ?? RING_TRACK_DEFAULT))
  return Number.isFinite(n) ? Math.max(RING_TRACK_MIN, Math.min(RING_TRACK_MAX, n)) : RING_TRACK_DEFAULT
}

/** Row-major canvas index of every track position, in track order. */
export function trackIndices(track: StringTrack, w: number, h: number, ringLeds: number): number[] {
  if (track === 'ring') return ringSampleMap(ringTrackLeds(ringLeds), 0, 'cw', w, h)
  if (track === 'column') {
    const x = Math.floor(w / 2)
    return Array.from({ length: h }, (_, y) => y * w + x)
  }
  const y = Math.floor(h / 2)
  return Array.from({ length: w }, (_, x) => y * w + x)
}

/** A position folded back onto a track of `len` cells. */
export function wrapTrack(pos: number, len: number): number {
  return ((pos % len) + len) % len
}

/**
 * Where a sub-pixel position lands: the two neighbouring cells and the share of
 * the particle each takes. The far neighbour wraps, so a particle crossing the
 * seam fades out of one end as it fades in at the other.
 */
export function trackSplat(pos: number, len: number): { a: number; b: number; covA: number; covB: number } {
  const p = wrapTrack(pos, len)
  const a = Math.min(len - 1, Math.floor(p))
  const frac = p - a
  return { a, b: (a + 1) % len, covA: 1 - frac, covB: frac }
}
