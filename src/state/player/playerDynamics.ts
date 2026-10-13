// Timing the Music Player's overlays and silence fade share between the browser
// preview (nodes/show/evaluate.ts) and the generic SD player sketch
// (codegen/playerSketchGenerator.ts emits these numbers), so a burst that
// fires in the preview fires on the device and a fade that lands here lands
// there.

/** Shortest gap between two particle bursts. Every beat edge used to spawn one,
 *  which at dance tempos kept sparks on screen without a break. */
export const PARTICLE_MIN_GAP_MS = 1500

/** Mean band energy at or below which the player counts the track as silent. */
export const SILENCE_ENERGY_FLOOR = 0.025
/** Energy above the floor over which the fade ramps from black to full. */
export const SILENCE_ENERGY_RANGE = 0.18
/** Per-frame approach rate while fading down: slow, so a pause between
 *  phrases does not flicker the LEDs. */
export const SILENCE_RELEASE_RATE = 0.045
/** Per-frame approach rate while fading back up. */
export const SILENCE_ATTACK_RATE = 0.18

/** Where the fade is heading for a given mean band energy (0 to 1). */
export function silenceFadeTarget(energy: number): number {
  const e = Math.max(0, Math.min(1, energy))
  if (e <= SILENCE_ENERGY_FLOOR) return 0
  return Math.max(0, Math.min(1, (e - SILENCE_ENERGY_FLOOR) / SILENCE_ENERGY_RANGE))
}

/** One frame of the fade moving toward `target`. */
export function silenceFadeStep(fade: number, target: number): number {
  const rate = target < fade ? SILENCE_RELEASE_RATE : SILENCE_ATTACK_RATE
  return fade + (target - fade) * rate
}
