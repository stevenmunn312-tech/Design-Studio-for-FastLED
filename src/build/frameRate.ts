/** Frames per second the loop is paced to; the preview gates to the same.
 *  Its own module so the node library can read it without loading board
 *  profiles, which the preview worker has no use for. */
export const FRAME_RATE = { min: 1, max: 120, default: 60 } as const
