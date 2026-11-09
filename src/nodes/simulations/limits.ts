/*
 * Pool sizes and step counts the slider, the preview and the sketch all bound
 * to. Each `max` is also the size of the sketch's static pool, so raising one
 * raises the firmware's RAM.
 */
export const FLOW_FIELD_COUNT = { min: 8, max: 400 } as const
export const STARFIELD_COUNT = { min: 8, max: 300 } as const
/** Boids neighbour radius in pixels; separation, alignment and cohesion are 0–1. */
export const BOIDS_VISUAL_RANGE = { min: 1, max: 8 } as const
/** Boids colour modes: solid takes the colour, every other mode reads the palette. */
export const BOID_COLOR_MODES = ['solid', 'palette', 'heading', 'density', 'position', 'radial', 'cycle'] as const
export const BOID_PALETTE_MODES: ReadonlySet<string> = new Set(BOID_COLOR_MODES.filter((mode) => mode !== 'solid'))
/** Gray-Scott updates per frame; each one costs a full pass over the matrix. */
export const REACTION_DIFFUSION_MAX_STEPS = 20
