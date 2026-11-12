import { trailSurvives } from '../shared/trailFade'

// Trails' decay keeps 1 - decay^3 of each channel per frame at this rate, the
// rate its saved values were tuned at; both sides spend it by elapsed time.
export const TRAILS_REFERENCE_FPS = 60

/**
 * The Trails decay whose fade matches a `trail` knob (0 none, 1 longest) on
 * the shared half-life scale of trailFade.ts: what a pattern that used
 * Juggle's own Trail sets on the Trails node that now makes its tails.
 */
export function trailsDecayForTrail(trail: number): number {
  const keep = trailSurvives(trail, 1 / TRAILS_REFERENCE_FPS)
  return Math.round(Math.cbrt(1 - keep) * 1000) / 1000
}
