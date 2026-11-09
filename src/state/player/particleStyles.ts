/**
 * The seventeen spark styles of the particle-burst overlay, by name.
 *
 * A style's position is the numeric id every renderer dispatches on: the
 * preview's `renderParticleBurst` (src/nodes/show/evaluate.ts), the SD
 * player's and the show sketch's `particleOverlay` switches, and a show
 * file's PARTICLE_BURST `style` param. So the list is append-only and in
 * that order. Player Particles stores the name; a generator turns it into
 * the id with `particleStyleIndex`.
 */
export const PARTICLE_STYLES = [
  'rise', 'rain', 'explode', 'fireworks', 'swirl', 'twinkle',
  'ring', 'fountain', 'helix', 'meteor', 'confetti',
  'sparkle', 'comet', 'snow', 'gravity', 'bubbles', 'vortex',
] as const

export type ParticleStyle = typeof PARTICLE_STYLES[number]

export const DEFAULT_PARTICLE_STYLE: ParticleStyle = 'rise'

/** The numeric id of a stored style name; anything else is the default. */
export function particleStyleIndex(value: unknown): number {
  const index = PARTICLE_STYLES.indexOf(value as ParticleStyle)
  return index < 0 ? 0 : index
}
