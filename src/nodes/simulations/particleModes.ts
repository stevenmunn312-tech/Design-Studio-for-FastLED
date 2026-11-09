// The Particles node's modes, shared by its select, the preview, the sketch and
// the RAM estimate. A mode outside the list (a save from before `swarm` was
// removed, say) runs as fountain on every side: the emitter's update loop is
// closed only by a known mode's branch, so an unknown one cannot reach it.
// `drops` was `gravity`, a name it shared with the Gravity knob; `chase` was
// `attractor`, a name it shared with Formula Points' de Jong attractor.
// `confetti` is gone because the Confetti node is that look. `orbit` is gone
// rather than folded into `vortex`: it was a fixed Count population turning
// rigidly with no decay, and vortex is a Rate-spawned, decaying population
// pulled inward at a constant tangential speed, so no one knob covers it.
export const PARTICLE_MODES = [
  'fountain', 'drops', 'fireworks', 'sparkle', 'comet', 'snow',
  'rain', 'embers', 'bubbles', 'vortex', 'fireflies',
  'meteor', 'tornado', 'pinwheel', 'bounce', 'chase', 'waterfall', 'luminova',
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

/** Modes that hold a fixed population from Count and never read Rate. */
const FIXED_COUNT_MODES = new Set(['bounce', 'fireflies', 'luminova'])
/** Modes whose particles keep a set brightness or live until they leave, so never read Decay. */
const UNDECAYING_MODES = new Set(['snow', 'bubbles', 'fireflies', 'bounce'])

/** Whether a mode reads Rate: comet and meteor lay one trail dot a frame, the fixed-count ones spawn none. */
export function particleModeUsesRate(mode: string): boolean {
  return !FIXED_COUNT_MODES.has(mode) && mode !== 'comet' && mode !== 'meteor'
}

/** Whether a mode reads Decay. */
export function particleModeUsesDecay(mode: string): boolean {
  return !UNDECAYING_MODES.has(mode)
}
