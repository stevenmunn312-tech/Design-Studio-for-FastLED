// The Particles node's modes, shared by its select, the preview, the sketch and
// the RAM estimate. A mode outside the list (a save from before `swarm` was
// removed, say) runs as fountain on every side: the emitter's update loop is
// closed only by a known mode's branch, so an unknown one cannot reach it.
export const PARTICLE_MODES = [
  'fountain', 'gravity', 'fireworks', 'sparkle', 'comet', 'snow',
  'rain', 'embers', 'bubbles', 'vortex', 'orbit', 'confetti', 'fireflies',
  'meteor', 'tornado', 'pinwheel', 'bounce', 'attractor', 'waterfall', 'luminova',
] as const
export type ParticleMode = typeof PARTICLE_MODES[number]

export function particleMode(value: unknown): ParticleMode {
  return (PARTICLE_MODES as readonly unknown[]).includes(value) ? value as ParticleMode : 'fountain'
}

/**
 * Slots in a Particles node's fixed firmware pool. The sketch declares its
 * arrays at this size and the RAM estimate prices the same number.
 */
export function particlePoolSize(mode: string): number {
  return mode === 'luminova' ? 240 : 120
}
