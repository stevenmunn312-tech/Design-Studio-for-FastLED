/*
 * Pool sizes and step counts the slider, the preview and the sketch all bound
 * to. Each `max` is also the size of the sketch's static pool, so raising one
 * raises the firmware's RAM.
 */
export const FLOW_FIELD_COUNT = { min: 8, max: 400 } as const
export const STARFIELD_COUNT = { min: 8, max: 300 } as const
/** Gray-Scott updates per frame; each one costs a full pass over the matrix. */
export const REACTION_DIFFUSION_MAX_STEPS = 20
