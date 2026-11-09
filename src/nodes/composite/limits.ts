/**
 * Bounds that an effect's slider, its preview and its sketch all apply, one
 * constant each (see the bounds rule in docs/development/patterns/graph-and-nodes.md).
 */

/** Array's copies, including the original. Each is a full pass over the
 *  frame on the board, so a wired count is held here too. */
export const ARRAY_COPIES = { min: 1, max: 24 } as const
