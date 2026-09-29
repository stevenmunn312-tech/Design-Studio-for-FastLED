// Particles' `luminova` mode: a few emitters steered by Perlin noise, each
// spiralling over the matrix and dropping a trail dot every frame. The trail
// fades through the pool's usual decay, and the dots are drawn a little larger
// so neighbours overlap into a soft, blurred ribbon.

/** Emitters at most; each leaves about 25 trail dots alive at the default decay. */
export const LUMINOVA_MAX = 8
/** LEDs an emitter moves each frame. */
export const LUMINOVA_STEP = 0.22
/** Radians the heading turns each frame before the noise steers it: the spiral. */
export const LUMINOVA_TURN = 0.05
/** Radians of steering the noise adds at its extremes, either way. */
export const LUMINOVA_WANDER = 0.6
/** Noise units per second, and between emitters, and the second axis per emitter. */
export const LUMINOVA_NOISE_SPEED = 0.3
export const LUMINOVA_NOISE_SEPARATION = 11.7
export const LUMINOVA_NOISE_LANE = 5.3
/** Extra life a trail dot loses each frame, on top of the node's decay. */
export const LUMINOVA_TRAIL_DECAY = 0.96
/** Trail dots are drawn this much larger than usual. */
export const LUMINOVA_BLUR = 1.5

export const luminovaEmitters = (count: number) => Math.max(2, Math.min(LUMINOVA_MAX, Math.round(count)))
