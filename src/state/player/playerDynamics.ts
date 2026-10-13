// Timing the Music Player's overlays and silence fade share between the browser
// preview (nodes/show/evaluate.ts) and the generic SD player sketch
// (codegen/playerSketchGenerator.ts emits these numbers), so a burst that
// fires in the preview fires on the device and a fade that lands here lands
// there.

/** Particle bursts arrive in volleys: this many consecutive beats each spawn
 *  a burst, then the sparks rest. Every beat used to spawn one, which at
 *  dance tempos kept sparks on screen without a break. */
export const PARTICLE_VOLLEY_BURSTS = 3
/** Rest after a volley's last burst before the next volley may start. */
export const PARTICLE_REST_MS = 4000

/** Where a player is in its volley: bursts still owed to the current volley
 *  and when the last burst fired. `lastMs` starts one rest in the past so the
 *  first beat of a track fires. */
export interface ParticleVolley { left: number; lastMs: number }

export function blankParticleVolley(): ParticleVolley {
  return { left: 0, lastMs: -PARTICLE_REST_MS }
}

/** Decide whether a beat at `nowMs` spawns a burst, advancing the volley. A
 *  clock that went backwards (a seek or a new track) starts a fresh volley.
 *  The firmware's `_audioBeat` gate makes the same moves. */
export function particleVolleyFire(volley: ParticleVolley, nowMs: number): boolean {
  if (nowMs < volley.lastMs) {
    volley.left = 0
    volley.lastMs = nowMs - PARTICLE_REST_MS
  }
  if (volley.left === 0) {
    if (nowMs - volley.lastMs < PARTICLE_REST_MS) return false
    volley.left = PARTICLE_VOLLEY_BURSTS
  }
  volley.left--
  volley.lastMs = nowMs
  return true
}

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
